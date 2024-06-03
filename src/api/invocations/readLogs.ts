import type { FastifyInstance, RouteOptions } from '@brer/fastify'
import type { Invocation } from '@brer/invocation'
import S from 'fluent-json-schema-es'
import { Readable } from 'node:stream'

import { getDocumentId } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    invocationUlid: string
  }
  Querystring: {
    // TODO: those params and HEAD route (keep in mind the utf8 thing)
    limitBytes?: number
    skipBytes?: number
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/invocations/:invocationUlid/logs',
  schema: {
    tags: ['invocation'],
    params: S.object()
      .additionalProperties(false)
      .prop('invocationUlid', S.raw({ type: 'string', format: 'ulid' }))
      .required(),
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

    const ok = await request.enforce('reader', invocation.project)
    if (!ok) {
      return reply.code(403).error()
    }

    reply.type('text/plain; charset=utf-8')
    return Readable.from(iterateLogs(this, invocation))
  },
})

async function* iterateLogs(
  { store }: FastifyInstance,
  invocation: Invocation,
): AsyncGenerator<Buffer> {
  if (invocation.logs) {
    for (const item of invocation.logs) {
      yield store.invocations.adapter.scope.attachment.get(
        invocation._id,
        item.attachment,
      )
    }
  }
}
