import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { TokenIssuer } from '../../lib/tokens.js'
import { getDocumentId } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    invocationUlid: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/invocations/:invocationUlid',
  config: {
    tokenIssuer: [TokenIssuer.API, TokenIssuer.INVOKER],
  },
  schema: {
    tags: ['invocation'],
    params: S.object()
      .prop('invocationUlid', S.raw({ type: 'string', format: 'ulid' }))
      .required(),
    response: {
      200: S.object().prop(
        'invocation',
        S.ref('https://brer.io/schema/v1/invocation.json'),
      ),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { params, session } = request

    const invocation = await store.invocations
      .find(getDocumentId('invocation', params.invocationUlid))
      .unwrap()

    if (!invocation) {
      return reply.code(404).error({ message: 'Invocation not found.' })
    }

    request.log.warn({ session })

    const authorized =
      session.token.issuer === TokenIssuer.INVOKER
        ? session.token.subject === invocation.pod
        : await request.enforce('reader', invocation.project)

    if (!authorized) {
      return reply.code(403).error()
    }

    reply.header('etag', invocation._rev)
    return { invocation }
  },
})
