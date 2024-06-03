import type {
  FastifyContext,
  FastifyInstance,
  FastifyRequest,
} from '@brer/fastify'
import type { Role } from '@brer/scope'
import plugin from 'fastify-plugin'

import { isOlderThan } from '../lib/util.js'

declare module 'fastify' {
  interface FastifyRequest {
    enforce(role: Role | 'admin', project?: string): Promise<boolean>
    getGrants(): Promise<Grants>
  }
}

/**
 * Serialized User's grants (numbers instead of strings)
 */
interface Grants {
  admin: boolean
  role: number
  projects: Record<string, number>
}

async function authorizationPlugin(fastify: FastifyInstance) {
  const { store } = fastify

  // TODO: make an option
  const grantsTimeout = 120 // 2 minutes (seconds)

  let lastUpdate = 0
  let promise: Promise<any> | null = null
  let usersGrants: Record<string, Grants | undefined> = {}

  // "no permissions" grants object
  const unauthorized: Grants = {
    admin: false,
    role: 0,
    projects: {},
  }

  const adminGrants: Grants = {
    admin: true,
    role: 0,
    projects: {},
  }

  async function buildGrants() {
    const grantsByScope: Record<string, Grants | undefined> = {}

    const scopes = store.scopes.filter().iterate()
    for await (const scope of scopes) {
      grantsByScope[scope.name] = {
        admin: scope.admin === true,
        role: toWeight(scope.role),
        projects: mapRoles(scope.projects),
      }
    }

    const grantsByUser: Record<string, Grants | undefined> = {}

    const users = store.users.filter().iterate()
    for await (const user of users) {
      if (user.scope && grantsByScope[user.scope]) {
        grantsByUser[user.username] = grantsByScope[user.scope]
      }
    }

    grantsByUser.admin = {
      admin: true,
      role: 0,
      projects: {},
    }

    return grantsByUser
  }

  async function getGrantsMethod(this: FastifyRequest): Promise<Grants> {
    if (!this.session) {
      // Not authenticated (see authentication plugin)
      return unauthorized
    }

    if (this.session.token.subject === 'admin') {
      // Special case (also skip any async action)
      return adminGrants
    }

    // Rebuild grants if required (see grants timeout)
    if (!promise && isOlderThan(lastUpdate, grantsTimeout)) {
      lastUpdate = Date.now()
      promise = buildGrants().then(
        obj => {
          promise = null
          usersGrants = obj
        },
        err => {
          promise = null
          lastUpdate = 0 // force regeneration
          return Promise.reject(err)
        },
      )
    }
    if (promise) {
      await promise
    }

    return usersGrants[this.session.token.subject] || unauthorized
  }

  async function enforceMethod(
    this: FastifyRequest,
    role: Role | 'admin',
    project?: string,
  ): Promise<boolean> {
    const grants = await this.getGrants()

    if (role === 'admin') {
      // Admin-only authorization
      return grants.admin === true
    }

    if (grants.admin) {
      // Admins skip all checks
      return true
    }

    const projectLevel = project ? grants.projects[project] || 0 : 0

    return Math.max(grants.role, projectLevel) >= toWeight(role)
  }

  function notReady() {
    return Promise.reject(new Error('Authorization plugin not ready'))
  }

  fastify.decorateRequest('enforce', notReady)
  fastify.decorateRequest('getGrants', notReady)

  fastify.addHook<any, FastifyContext>('onRequest', async (request, reply) => {
    request.enforce = enforceMethod
    request.getGrants = getGrantsMethod

    if (request.routeOptions.config?.admin) {
      const ok = await request.enforce('admin')
      if (!ok) {
        return reply.code(401).sendError()
      }
    }
  })

  fastify.addHook('onReady', async () => {
    lastUpdate = Date.now()
    usersGrants = await buildGrants()
  })
}

function toWeight(role: unknown): number {
  switch (role) {
    case 'writer':
      return 3
    case 'invoker':
      return 2
    case 'reader':
      return 1
    default:
      return 0
  }
}

function mapRoles(source: Record<string, Role> = {}) {
  const target: Record<string, number> = {}

  for (const key of Object.keys(source)) {
    const w = toWeight(source[key])
    if (w > 0) {
      target[key] = w
    }
  }

  return target
}

export default plugin(authorizationPlugin, {
  name: 'authorization',
  decorators: {
    fastify: ['store'],
    request: ['session'],
  },
})
