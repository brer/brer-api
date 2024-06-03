import type { RouteOptions } from '@brer/fastify'
import type { Invocation } from '@brer/invocation'
import S from 'fluent-json-schema-es'

import { createFunction, updateFunction } from '../../lib/function.js'
import {
  type ContainerImage,
  parseImagePath,
  IMAGE_PATH_REGEXP,
  IMAGE_TAG_REGEXP,
  IMAGE_HOST_REGEXP,
  IMAGE_NAME_REGEXP,
} from '../../lib/image.js'
import { createInvocation } from '../../lib/invocation.js'
import { getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Body: {
    env?: {
      name: string
      value?: string
      secretName?: string
      secretKey?: string
    }[]
    image: string | ContainerImage
    project: string
    historyLimit?: number
    sequential?: boolean
    retries?: number
    resources?: {
      requests?: {
        cpu?: string
        memory?: string
      }
      limits?: {
        cpu?: string
        memory?: string
      }
    }
  }
  Params: {
    functionName: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'PUT',
  url: '/api/v1/functions/:functionName',
  schema: {
    tags: ['function'],
    params: S.object()
      .additionalProperties(false)
      .prop('functionName', sSlug())
      .required(),
    body: S.object()
      .additionalProperties(false)
      .prop(
        'image',
        S.oneOf([
          S.string().minLength(3).maxLength(256).pattern(IMAGE_PATH_REGEXP),
          S.object()
            .additionalProperties(false)
            .prop(
              'host',
              S.string().minLength(1).maxLength(512).pattern(IMAGE_HOST_REGEXP),
            )
            .required()
            .prop(
              'name',
              S.string()
                .minLength(1)
                .maxLength(4096)
                .pattern(IMAGE_NAME_REGEXP),
            )
            .required()
            .prop(
              'tag',
              S.string().minLength(1).maxLength(128).pattern(IMAGE_TAG_REGEXP),
            )
            .required(),
        ]),
      )
      .required()
      .prop(
        'env',
        S.array()
          .maxItems(20)
          .items(
            S.object()
              .additionalProperties(false)
              .prop(
                'name',
                S.string()
                  .minLength(1)
                  .maxLength(256)
                  .pattern(/^[0-9A-Za-z_]+$/),
              )
              .required()
              .prop('value', S.string().maxLength(4096).minLength(1))
              .prop('secretName', S.string().maxLength(256).minLength(1))
              .prop('secretKey', S.string().maxLength(256).minLength(1)),
          ),
      )
      .prop('project', sSlug().default('default'))
      .required()
      .prop('historyLimit', S.integer().minimum(0).default(10))
      .prop('sequential', S.boolean().default(false))
      .prop('retries', S.integer().minimum(0).maximum(10).default(0))
      .prop(
        'resources',
        S.object()
          .additionalProperties(false)
          .prop(
            'requests',
            S.object()
              .additionalProperties(false)
              .prop('cpu', S.string())
              .prop('memory', S.string()),
          )
          .prop(
            'limits',
            S.object()
              .additionalProperties(false)
              .prop('cpu', S.string())
              .prop('memory', S.string()),
          ),
      ),
    response: {
      '2xx': S.object()
        .prop('function', S.ref('https://brer.io/schema/v1/function.json'))
        .required()
        .prop('invocation', S.ref('https://brer.io/schema/v1/invocation.json')),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { body, params } = request

    const image =
      typeof body.image === 'string' ? parseImagePath(body.image) : body.image
    if (!image) {
      return reply.code(400).error({ message: 'Invalid image.' })
    }

    const counter: Record<string, boolean | undefined> = {}
    const envVars = body.env || []

    for (const obj of envVars) {
      if (counter[obj.name]) {
        return reply.error({
          message: `Env ${obj.name} was already declared.`,
          info: { env: obj },
        })
      } else {
        counter[obj.name] = true
      }

      if (/^BRER_/i.test(obj.name)) {
        // All `BRER_` envs are reserved
        return reply.error({
          message: `Env ${obj.name} uses a reserved name.`,
          info: { env: obj },
        })
      }

      if (obj.value) {
        // Plain env variable
        if (obj.secretName || obj.secretKey) {
          return reply.error({
            message: 'Env variable with a secret reference.',
            info: { env: obj },
            statusCode: 400,
          })
        }
      } else {
        // Partial secret reference
        if (!obj.secretKey || !obj.secretName) {
          return reply.error({
            message: 'Missing secret reference.',
            info: { env: obj },
            statusCode: 400,
          })
        }
      }
    }

    let authorized = await request.enforce('writer', body.project)

    const oldFn = authorized
      ? await store.functions
          .find(getDocumentId('function', params.functionName))
          .unwrap()
      : null

    if (oldFn && authorized && oldFn.project !== body.project) {
      authorized = await request.enforce('writer', oldFn.project)
    }

    if (!authorized) {
      return reply.code(403).error()
    }

    let created = false
    const newFn = await store.functions
      .from(oldFn)
      .ensure(() => {
        created = true
        return createFunction(params.functionName)
      })
      .update(fn =>
        updateFunction(fn, {
          env: envVars,
          image,
          project: body.project,
          historyLimit: body.historyLimit,
          resources: {
            requests: body.resources?.requests,
            limits: body.resources?.limits,
          },
          retries: body.retries,
          sequential: body.sequential,
        }),
      )
      .unwrap()

    if (!newFn) {
      // This shouldn't be possible
      throw new Error('Expected Function document')
    }

    let invocation: Invocation | undefined
    if (!newFn.runtime) {
      invocation = await store.invocations
        .create(
          createInvocation({
            env: newFn.env,
            functionName: newFn.name,
            image: newFn.image,
            project: newFn.project,
            resources: newFn.resources,
            retries: newFn.retries,
            runtimeTest: true,
          }),
        )
        .unwrap()
    }

    reply.code(created ? 201 : 200)
    return {
      function: newFn,
      invocation,
    }
  },
})
