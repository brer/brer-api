import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { getDocumentId } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    invocationUlid: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'DELETE',
  url: '/api/v1/invocations/:invocationUlid',
  schema: {
    tags: ['invocation'],
    params: S.object()
      .prop('invocationUlid', S.raw({ type: 'string', format: 'ulid' }))
      .required(),
    response: {
      204: S.null(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { params } = request

    const invocation = await store.invocations
      .find(getDocumentId('invocation', params.invocationUlid))
      .unwrap()

    if (!invocation) {
      return reply.code(404).error({ message: 'Invocation not found.' })
    }

    const ok = await request.enforce('writer', invocation.project)
    if (!ok) {
      return reply.code(403).error()
    }

    await store.invocations.from(invocation).delete().consume()

    return reply.code(204).send()
  },
})
