import Fastify from 'fastify'
import noAdditionalProperties from 'fastify-no-additional-properties'
import { randomBytes } from 'node:crypto'

import api from '../src/api/plugin.js'

import ajvPlugin from '../src/lib/ajv.js'
import authentication from '../src/lib/authentication.js'
import authorization from '../src/lib/authorization.js'
import cookie from '../src/lib/cookie.js'
import error from '../src/lib/error.js'
import { addSchema } from '../src/lib/schema.js'
import store from '../src/lib/store.js'
import tokens from '../src/lib/tokens.js'

export default function createTestServer(adminPassword: string) {
  const fastify = Fastify.default({
    ajv: {
      customOptions: {
        allErrors: true,
        coerceTypes: false,
        removeAdditional: true,
        useDefaults: true,
      },
      plugins: [ajvPlugin],
    },
    bodyLimit: 2097152, // 2 MiB (bytes)
    caseSensitive: true,
    ignoreTrailingSlash: false,
    logger: {
      level: 'debug',
      transport: {
        target: 'pino/file',
        options: {
          append: false,
          destination: './fastify.ndjson',
          mkdir: false,
        },
      },
    },
  })

  fastify.register(error)
  fastify.register(noAdditionalProperties, {
    body: true,
    headers: false,
    params: true,
    query: true,
    response: true,
  })

  addSchema(fastify)

  fastify.register(tokens, {
    secret: randomBytes(32).toString('hex'),
  })

  fastify.register(store, {
    url: process.env.COUCHDB_URL,
    username: process.env.COUCHDB_USERNAME,
    password: process.env.COUCHDB_PASSWORD,
  })

  fastify.register(cookie)

  fastify.register(authentication, { adminPassword })
  fastify.register(authorization)
  fastify.register(api)

  return fastify
}
