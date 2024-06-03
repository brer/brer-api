import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    scopeName: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'DELETE',
  url: '/api/v1/scopes/:scopeName',
  config: {
    admin: true,
  },
  schema: {
    tags: ['scope'],
    params: S.object().prop('scopeName', sSlug()).required(),
    response: {
      204: S.null(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { params } = request

    const ok = await store.scopes
      .find(getDocumentId('scope', params.scopeName))
      .delete()
      .consume()

    if (!ok) {
      return reply.code(404).error({ message: 'Scope not found.' })
    }

    return reply.code(204).send()
  },
})
