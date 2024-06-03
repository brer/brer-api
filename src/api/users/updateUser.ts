import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { getDocumentId, sSlug } from '../../lib/util.js'
import { hashSecret } from '../../lib/hash.js'

export interface RouteGeneric {
  Params: {
    username: string
  }
  Body: {
    /**
     * Scope's name.
     */
    scope?: string
    /**
     * Override current password if defined.
     */
    password?: string
    /**
     * Password expiration date.
     */
    expiresAt?: string
    /**
     * Password validity in seconds since the last set.
     */
    expiresIn?: number
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'PUT',
  url: '/api/v1/users/:username',
  config: {
    admin: true,
  },
  schema: {
    tags: ['user'],
    params: S.object()
      .additionalProperties(false)
      .prop('username', sSlug())
      .required(),
    body: S.object()
      .additionalProperties(false)
      .prop('scope', sSlug())
      .prop(
        'password',
        S.string()
          .minLength(8)
          .pattern(/^[\x20-\x7e]+$/),
      )
      .prop('expiresAt', S.string().format('date-time'))
      .prop('expiresIn', S.integer().minimum(1)),
    response: {
      '2xx': S.object()
        .prop('user', S.ref('https://brer.io/schema/v1/user.json'))
        .required(),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { body, params } = request

    if (params.username === 'admin' && body.scope) {
      return reply
        .code(422)
        .error({ message: 'Admin user cannot have a scope.' })
    }
    if ((body.expiresAt || body.expiresIn) && !body.password) {
      return reply.code(422).error({ message: 'Expected plain password.' })
    }

    if (body.scope) {
      const ok = await store.scopes
        .find(getDocumentId('scope', body.scope))
        .consume()

      if (!ok) {
        return reply.code(422).error({ message: 'Unknown Scope name.' })
      }
    }

    let created = false

    const user = await store.users
      .read(getDocumentId('user', params.username))
      .ensure(() => {
        created = true
        return {
          _id: getDocumentId('user', params.username),
          username: params.username,
        }
      })
      .assign({ scope: body.scope })
      .update(async u => {
        if (body.password) {
          let expiresAt = body.expiresAt
          if (!expiresAt && body.expiresIn) {
            expiresAt = new Date(
              Date.now() + body.expiresIn * 1000,
            ).toISOString()
          }

          return {
            ...u,
            hash: await hashSecret(body.password),
            expiresAt,
          }
        }
      })
      .unwrap()

    reply.code(created ? 201 : 200)
    return {
      user,
    }
  },
})
