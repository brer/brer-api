import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

export default (): RouteOptions => ({
  method: 'GET',
  url: '/api/session',
  config: {
    public: true,
  },
  schema: {
    response: {
      200: S.object()
        .additionalProperties(false)
        .prop('authenticated', S.boolean())
        .required()
        .prop(
          'session',
          S.object()
            .additionalProperties(false)
            .prop('type', S.string().enum(['basic', 'bearer', 'cookie']))
            .required(),
        )
        .prop(
          'user',
          S.object()
            .additionalProperties(false)
            .prop('username', S.string())
            .required()
            .prop('admin', S.boolean())
            .required()
            .prop('projects', S.array().items(S.string()))
            .required(),
        ),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { session } = request

    if (!session) {
      return { authenticated: false }
    }

    const grants = await request.getGrants()

    const projects = Object.keys(grants.projects || {})
    if (grants.admin || grants.role) {
      // TODO: reduce
      await store.functions
        .filter()
        .tap(fn => {
          if (!projects.includes(fn.project)) {
            projects.push(fn.project)
          }
        })
        .consume()
    }

    return {
      authenticated: true,
      session: {
        type: session.type,
      },
      user: {
        username: session.token.subject,
        admin: grants.admin === true,
        projects,
      },
    }
  },
})
