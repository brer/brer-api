import type { FastifyContext, FastifyInstance } from '@brer/fastify'
import { constantCase } from 'case-anything'
import S from 'fluent-json-schema-es'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { createInvocation } from '../../lib/invocation.js'
import { MAX_KEY, MIN_KEY, getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Body: Buffer
  Params: {
    functionName: string
  }
}

export default async function plugin(fastify: FastifyInstance) {
  fastify.removeAllContentTypeParsers()

  fastify.addContentTypeParser('*', (request, payload, done) => {
    toBuffer(payload)
      .then(buffer => done(null, buffer))
      .catch(done)
  })

  fastify.route<RouteGeneric, FastifyContext>({
    method: 'POST',
    url: '/api/v1/functions/:functionName',
    schema: {
      tags: ['function', 'invocation'],
      params: S.object().prop('functionName', sSlug()).required(),
      response: {
        202: S.object()
          .additionalProperties(false)
          .prop('function', S.ref('https://brer.io/schema/v1/function.json'))
          .required()
          .prop(
            'invocation',
            S.ref('https://brer.io/schema/v1/invocation.json'),
          )
          .required(),
      },
    },
    async handler(request, reply) {
      const { store } = this
      const { body, headers, params } = request

      const fn = await store.functions
        .find(getDocumentId('function', params.functionName))
        .unwrap()

      if (!fn) {
        return reply.code(404).error({ message: 'Function not found.' })
      }

      const ok = await request.enforce('invoker', fn.project)
      if (!ok) {
        return reply.code(403).error()
      }

      if (headers['x-idempotency-key']) {
        // const lostInvocation = await store.invocations
        //   .find({
        //     _design: 'default',
        //     _view: 'idempotency',
        //     key: headers['x-idempotency-key'],
        //   })
        //   .unwrap()
        // if (lostInvocation) {
        //   reply.code(202)
        //   return {
        //     function: fn,
        //     invocation: lostInvocation,
        //   }
        // }

        throw new Error('To be implemented')
      }

      const env: Record<string, string> = {}
      const keys = Object.keys(headers).filter(key => /^x-brer-env-/.test(key))
      for (const key of keys) {
        const value = request.headers[key]
        if (typeof value === 'string' || value === undefined) {
          const envName = constantCase(key.substring(11))
          if (/^BRER_/i.test(envName)) {
            return reply.code(412).error({
              message: `Header ${key} uses a reserved env name.`,
            })
          }
          env[envName] = value || ''
        }
      }

      if (fn.sequential) {
        const found = await store.invocations
          .find({
            _design: 'default',
            _view: 'list_by_function',
            startkey: [params.functionName, 1, MIN_KEY],
            endkey: [params.functionName, 1, MAX_KEY],
          })
          .consume()

        if (found) {
          return reply.error({
            code: 'SEQUENTIAL_FUNCTION',
            message: 'Cannot spawn concurrent Invocations for this Function.',
            statusCode: 422,
          })
        }
      }

      const invocation = await store.invocations
        .create(
          createInvocation(
            {
              env: fn.env,
              functionName: fn.name,
              image: fn.image,
              project: fn.project,
              resources: fn.resources,
              retries: fn.retries,
            },
            body,
            headers['content-type'],
          ),
        )
        .unwrap()

      reply.code(202)
      return {
        function: fn,
        invocation,
      }
    },
  })
}

async function toBuffer(readable: Readable) {
  const chunks: Buffer[] = []

  // TODO: encoding?
  await pipeline(
    readable,
    new Writable({
      decodeStrings: true,
      objectMode: false,
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk, encoding))
        callback()
      },
    }),
  )

  return Buffer.concat(chunks)
}
