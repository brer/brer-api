import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from '@brer/fastify'
import cookiePlugin, { type CookieSerializeOptions } from '@fastify/cookie'
import plugin from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    getAuthCookie(): string | undefined
  }
  interface FastifyReply {
    setAuthCookie(value: string): void
    unsetAuthCookie(): void
  }
}

export interface PluginOptions {
  /**
   * @default "brer_session"
   */
  cookie?: string
  /**
   *
   */
  domain?: string
  /**
   *
   */
  secure?: boolean
  /**
   * @default "none"
   */
  sameSite?: 'strict' | 'lax' | 'none'
  /**
   * Seconds. Defaults to 30 days.
   */
  maxAge?: number
}

async function biscuitsPlugin(
  fastify: FastifyInstance,
  pluginOptions: PluginOptions,
) {
  fastify.register(cookiePlugin, { hook: 'onRequest' })

  const cookieName = pluginOptions.cookie || 'brer_session'

  const cookieOptions: CookieSerializeOptions = {
    domain: pluginOptions.domain || undefined,
    httpOnly: true,
    maxAge: pluginOptions.maxAge || 2592000, // 30 days (seconds)
    path: '/',
    sameSite: pluginOptions.sameSite || undefined,
    secure: pluginOptions.secure ?? process.env.NODE_ENV === 'production',
    signed: false,
  }

  function notReady(): never {
    throw new Error('Not ready')
  }

  fastify.decorateRequest('getAuthCookie', notReady)
  fastify.decorateReply('setAuthCookie', notReady)
  fastify.decorateReply('unsetAuthCookie', notReady)

  function getAuthCookie(this: FastifyRequest): string | undefined {
    return this.cookies[cookieName]
  }

  function setAuthCookie(this: FastifyReply, value: string): void {
    this.setCookie(cookieName, value, cookieOptions)
  }

  function unsetAuthCookie(this: FastifyReply): void {
    this.clearCookie(cookieName, cookieOptions)
  }

  fastify.addHook('onRequest', async (request, reply) => {
    request.getAuthCookie = getAuthCookie
    reply.setAuthCookie = setAuthCookie
    reply.unsetAuthCookie = unsetAuthCookie
  })
}

export default plugin(biscuitsPlugin, {
  name: 'cookie',
})
