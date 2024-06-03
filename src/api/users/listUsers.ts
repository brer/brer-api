import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

export interface RouteGeneric {}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/users',
  config: {
    admin: true,
  },
  schema: {
    tags: ['user'],
    response: {
      200: S.object()
        .additionalProperties(false)
        .prop(
          'users',
          S.array().items(S.ref('https://brer.io/schema/v1/user.json')),
        )
        .required()
        .prop('continue', S.string())
        .description(
          'You can use this token in querystring to retrieve the next page.',
        ),
    },
  },
  async handler(request, reply) {
    const { store } = this

    // TODO: pagination
    const users = await store.users.filter().unwrap()

    return { users }
  },
})
