import Fastify from 'fastify'
import noAdditionalProperties from 'fastify-no-additional-properties'

import ajvPlugin from './lib/ajv.js'
import authentication from './lib/authentication.js'
import authorization from './lib/authorization.js'
import cookie from './lib/cookie.js'
import error from './lib/error.js'
import probes from './lib/probes.js'
import { addSchema } from './lib/schema.js'
import store from './lib/store.js'
import tokens from './lib/tokens.js'

import api from './api/plugin.js'

export default function createServer() {
  const fastify = Fastify.default({
    ajv: {
      customOptions: {
        allErrors: process.env.NODE_ENV !== 'production',
        coerceTypes: false,
        removeAdditional: true,
        useDefaults: true,
      },
      plugins: [ajvPlugin],
    },
    bodyLimit: 2097152, // 2 MiB (bytes)
    caseSensitive: true,
    ignoreTrailingSlash: false,
    requestTimeout: 60000,
    logger: {
      level: process.env.LOG_LEVEL || 'debug',
      transport:
        process.env.LOG_PRETTY === 'enable' && !process.env.LOG_FILE
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: true,
              },
            }
          : {
              target: 'pino/file',
              options: {
                destination: process.env.LOG_FILE || process.stdout.fd,
              },
            },
    },
  })

  fastify.register(error)
  fastify.register(probes)

  fastify.register(noAdditionalProperties, {
    body: true,
    headers: false,
    params: true,
    query: true,
    response: true,
  })

  addSchema(fastify)

  fastify.register(tokens, {
    secret: process.env.JWT_SECRET,
    privateKey: process.env.JWT_PRIVATE_KEY,
    publicKeys: pickDefined(
      process.env.API_PUBLIC_KEY,
      process.env.CONTROLLER_PUBLIC_KEY,
    ),
  })

  fastify.register(store, {
    url: process.env.COUCHDB_URL,
    username: process.env.COUCHDB_USERNAME,
    password: process.env.COUCHDB_PASSWORD,
  })

  // TODO: other options
  fastify.register(cookie, {
    cookie: process.env.COOKIE_NAME,
    domain: process.env.COOKIE_DOMAIN,
    // maxAge,
    // sameSite,
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'enable'
      : process.env.NODE_ENV === 'production',
  })

  fastify.register(authentication, {
    adminPassword: process.env.ADMIN_PASSWORD,
  })

  fastify.register(authorization)

  fastify.register(api)

  return fastify
}

function pickDefined(...values: Array<string | undefined>): string[] {
  const results: string[] = []
  for (const value of values) {
    if (value) {
      results.push(value)
    }
  }
  return results
}
