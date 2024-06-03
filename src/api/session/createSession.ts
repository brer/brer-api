import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

export interface RouteGeneric {
  Body: {
    username: string
    password: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'POST',
  url: '/api/session',
  config: {
    public: true,
  },
  schema: {
    body: S.object()
      .additionalProperties(false)
      .prop('username', S.string())
      .required()
      .prop('password', S.string())
      .required(),
    response: {
      201: S.object()
        .additionalProperties(false)
        .prop('authenticated', S.boolean().const(true))
        .required()
        .prop(
          'session',
          S.object()
            .additionalProperties(false)
            .prop('type', S.string().const('cookie'))
            .required(),
        )
        .required()
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
        )
        .required(),
    },
  },
  async handler(request, reply) {
    const { authenticate, store } = this
    const { body } = request

    const token = await authenticate(body.username, body.password)
    if (!token) {
      return reply.code(401).error()
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

    reply.code(201)
    reply.setAuthCookie(token.raw)
    return {
      authenticated: true,
      session: {
        type: 'cookie',
      },
      user: {
        username: body.username,
        admin: grants.admin === true,
        projects,
      },
    }
  },
})
