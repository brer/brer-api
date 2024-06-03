import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    functionName: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/functions/:functionName',
  schema: {
    tags: ['function'],
    params: S.object().prop('functionName', sSlug()).required(),
    response: {
      200: S.object()
        .prop('function', S.ref('https://brer.io/schema/v1/function.json'))
        .required(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { params } = request

    const fn = await store.functions
      .find(getDocumentId('function', params.functionName))
      .unwrap()

    if (!fn) {
      return reply.code(404).error({ message: 'Function not found.' })
    }

    const ok = await request.enforce('reader', fn.project)
    if (!ok) {
      return reply.code(403).error()
    }

    reply.header('etag', fn._rev)
    return { function: fn }
  },
})
