import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    username: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'DELETE',
  url: '/api/v1/users/:username',
  config: {
    admin: true,
  },
  schema: {
    tags: ['user'],
    params: S.object().prop('username', sSlug()).required(),
    response: {
      204: S.null(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { params } = request

    const ok = await store.users
      .find(getDocumentId('user', params.username))
      .delete()
      .consume()

    if (!ok) {
      return reply.code(404).error({ message: 'User not found.' })
    }

    return reply.code(204).send()
  },
})
