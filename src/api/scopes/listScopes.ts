import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

export interface RouteGeneric {}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/scopes',
  config: {
    admin: true,
  },
  schema: {
    tags: ['scope'],
    response: {
      200: S.object()
        .additionalProperties(false)
        .prop(
          'scopes',
          S.array().items(S.ref('https://brer.io/schema/v1/scope.json')),
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

    // TODO: view
    const scopes = await store.scopes.filter().unwrap()

    return { scopes }
  },
})
