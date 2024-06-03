import type { RouteOptions } from '@brer/fastify'
import type { Role } from '@brer/scope'
import S from 'fluent-json-schema-es'
import { getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Params: {
    scopeName: string
  }
  Body: {
    admin?: boolean
    role?: Role
    projects?: Record<string, Role>
  }
}

function sRole() {
  return S.string().enum(['reader', 'invoker', 'writer'])
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'PUT',
  url: '/api/v1/scopes/:scopeName',
  config: {
    admin: true,
  },
  schema: {
    tags: ['scope'],
    params: S.object()
      .additionalProperties(false)
      .prop('scopeName', sSlug())
      .required(),
    body: S.object()
      .additionalProperties(false)
      .prop('admin', S.boolean().default(false))
      .prop('role', sRole())
      .prop('projects', S.object().additionalProperties(sRole()))
      .required(),
    response: {
      '2xx': S.object()
        .prop('scope', S.ref('https://brer.io/schema/v1/scope.json'))
        .required(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { body, params } = request

    const projects = Object.keys(body.projects || {})

    if (!body.admin && !body.role && projects.length >= 2) {
      // TODO: create a custom view for projects subsets
      return reply
        .code(501)
        .error({ message: "Projects' subsets are not supported." })
    }

    let created = false

    const scope = await store.scopes
      .read(getDocumentId('scope', params.scopeName))
      .ensure(() => {
        created = true
        return {
          _id: getDocumentId('scope', params.scopeName),
          name: params.scopeName,
        }
      })
      .update(p => ({
        ...p,
        admin: body.admin,
        role: body.role,
        projects: body.projects,
      }))
      .unwrap()

    reply.code(created ? 201 : 200)
    return {
      scope,
    }
  },
})
