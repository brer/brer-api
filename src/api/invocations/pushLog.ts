import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { pushLogPage } from '../../lib/invocation.js'
import { asInteger } from '../../lib/qs.js'
import { TokenIssuer } from '../../lib/tokens.js'
import { getDocumentId } from '../../lib/util.js'

export interface RouteGeneric {
  Body: string
  Params: {
    invocationUlid: string
    pageIndex: number
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'PUT',
  url: '/api/v1/invocations/:invocationUlid/log/:pageIndex',
  config: {
    tokenIssuer: TokenIssuer.INVOKER,
  },
  schema: {
    tags: ['invocation'],
    params: S.object()
      .prop('invocationUlid', S.raw({ type: 'string', format: 'ulid' }))
      .required()
      .prop('pageIndex', S.integer().minimum(0))
      .required(),
    body: S.string(),
  },
  async preValidation(request) {
    request.params.pageIndex = asInteger(request.params.pageIndex)
  },
  async handler(request, reply) {
    const { store } = this
    const { body, params, session } = request

    const oldInvocation = await store.invocations
      .find(getDocumentId('invocation', params.invocationUlid))
      .unwrap()

    if (!oldInvocation) {
      return reply.code(404).error({ message: 'Invocation not found.' })
    }
    if (session.token.subject !== oldInvocation.pod) {
      return reply.code(403).error()
    }
    if (
      oldInvocation.status !== 'initializing' &&
      oldInvocation.status !== 'running'
    ) {
      return reply.code(422).error({ message: 'Invalid Invocation status.' })
    }

    const newInvocation = await store.invocations
      .from(oldInvocation)
      .update(doc =>
        pushLogPage(doc, Buffer.from(body, 'utf-8'), params.pageIndex),
      )
      .unwrap()

    reply.header('etag', newInvocation._rev)
    return reply.code(204).send()
  },
})
