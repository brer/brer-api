import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { MAX_KEY, MIN_KEY, getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    functionName: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'DELETE',
  url: '/api/v1/functions/:functionName',
  schema: {
    tags: ['function'],
    params: S.object().prop('functionName', sSlug()).required(),
    response: {
      204: S.null(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { log, params } = request

    const fn = await store.functions
      .find(getDocumentId('function', params.functionName))
      .unwrap()

    if (!fn) {
      return reply.code(404).error({ message: 'Function not found.' })
    }

    const ok = await request.enforce('writer', fn.project)
    if (!ok) {
      return reply.code(403).error()
    }

    await store.functions.from(fn).delete().consume()

    await store.invocations
      .filter({
        _design: 'default',
        _view: 'list_by_function',
        startkey: [fn.name, MIN_KEY, MIN_KEY],
        endkey: [fn.name, MAX_KEY, MAX_KEY],
      })
      .delete()
      .tap(doc => log.debug({ invocationUlid: doc.ulid }, 'delete invocation'))
      .consume()

    return reply.code(204).send()
  },
})
