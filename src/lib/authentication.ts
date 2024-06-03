import type { FastifyContext, FastifyInstance } from '@brer/fastify'
import plugin from 'fastify-plugin'

import { verifySecret } from '../lib/hash.js'
import { parseAuthorizationHeader } from '../lib/header.js'
import { Token, TokenIssuer } from '../lib/tokens.js'
import { getDocumentId } from '../lib/util.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(username: string, password: string): Promise<Token | null>
  }
  interface FastifyRequest {
    /**
     * Current session.
     * Can be `undefined` if the route is public.
     */
    session: {
      type: 'basic' | 'bearer' | 'cookie'
      token: Token
    }
  }
}

interface Title {
  type: 'basic' | 'bearer' | 'cookie'
  token: string
}

export interface PluginOptions {
  adminPassword?: string
}

async function authPlugin(
  fastify: FastifyInstance,
  { adminPassword }: PluginOptions,
) {
  const { store, tokens } = fastify

  const authenticate = async (
    username: string,
    password: string,
  ): Promise<Token | null> => {
    if (username === 'admin' && adminPassword) {
      return adminPassword === password ? tokens.signApiToken(username) : null
    }

    const user = await store.users
      .find(getDocumentId('user', username))
      .unwrap()

    if (user && user.hash) {
      const ok = await verifySecret(password, user.hash)
      if (ok) {
        if (user.expiresAt) {
          const now = new Date()
          if (now.toISOString() >= user.expiresAt) {
            return null
          }
        }
        return tokens.signApiToken(username)
      }
    }

    return null
  }

  /**
   * Set `request.token` value.
   */
  fastify.addHook<any, FastifyContext>('onRequest', async (request, reply) => {
    const { headers } = request

    const titles: Title[] = []

    if (headers.authorization) {
      const authorization = parseAuthorizationHeader(headers.authorization)
      if (!authorization) {
        return reply
          .code(401)
          .sendError({ message: 'Unsupported authorization scheme.' })
      }

      if (authorization.type === 'basic') {
        const token = await authenticate(
          authorization.username,
          authorization.password,
        )
        if (token) {
          request.session = {
            token,
            type: 'basic',
          }
        }
      } else if (authorization.type === 'bearer') {
        titles.push({
          type: 'bearer',
          token: authorization.token,
        })
      }
    }

    if (request.session) {
      // authenticated with basic scheme
      return
    }

    const cookie = request.getAuthCookie()
    if (cookie) {
      titles.push({
        type: 'cookie',
        token: cookie,
      })
    }

    for (const { type, token } of titles) {
      if (!request.session) {
        try {
          request.session = {
            token: await fastify.tokens.verifyToken(
              token,
              TokenIssuer.API,
              request.routeOptions.config.tokenIssuer || TokenIssuer.API,
            ),
            type,
          }
        } catch (err) {
          request.log.debug(
            { sessionType: type, err },
            'token verification failed',
          )
          if (type === 'cookie') {
            reply.unsetAuthCookie()
          }
        }
      }
    }
  })

  /**
   * Apply authentication rules.
   */
  fastify.addHook<any, FastifyContext>('onRequest', async (request, reply) => {
    if (!request.routeOptions.config.public && !request.session) {
      return reply.code(401).sendError()
    }
  })

  fastify.decorate('authenticate', authenticate)
  fastify.decorateRequest('session', null)
}

export default plugin(authPlugin, {
  name: 'auth',
  decorators: {
    fastify: ['tokens'],
    request: ['getAuthCookie'],
    reply: ['unsetAuthCookie'],
  },
})
