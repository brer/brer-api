import type { FastifyInstance, RouteOptions } from '@brer/fastify'
import type { FnRuntime } from '@brer/function'
import type { Invocation } from '@brer/invocation'
import S from 'fluent-json-schema-es'

import { isSameImage } from '../../lib/image.js'
import {
  completeInvocation,
  failInvocation,
  handleInvocation,
  progressInvocation,
  runInvocation,
} from '../../lib/invocation.js'
import { TokenIssuer } from '../../lib/tokens.js'
import { MAX_KEY, MIN_KEY, getDocumentId, isOlderThan } from '../../lib/util.js'

export interface RouteGeneric {
  Body: {
    status: 'initializing' | 'running' | 'completed' | 'failed'
    result?: unknown
    reason?: unknown
  }
  Params: {
    invocationUlid: string
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'PUT',
  url: '/api/v1/invocations/:invocationUlid',
  config: {
    tokenIssuer: [TokenIssuer.API, TokenIssuer.INVOKER],
  },
  schema: {
    tags: ['invocation'],
    params: S.object()
      .prop('invocationUlid', S.raw({ type: 'string', format: 'ulid' }))
      .required(),
    body: S.object()
      .prop(
        'status',
        S.string().enum(['initializing', 'running', 'completed', 'failed']),
      )
      .required()
      .prop('result')
      .prop('reason'),
    response: {
      200: S.object().prop(
        'invocation',
        S.ref('https://brer.io/schema/v1/invocation.json'),
      ),
    },
  },
  async handler(request, reply) {
    const { store } = this
    const { body, headers, params, session } = request

    if (session.token.issuer === TokenIssuer.API && body.status !== 'failed') {
      return reply.code(403).error({ message: 'Unexpected subject request.' })
    }

    const oldInvocation = await store.invocations
      .find(getDocumentId('invocation', params.invocationUlid))
      .unwrap()

    if (!oldInvocation) {
      return reply.code(404).error({ message: 'Invocation not found.' })
    }
    if (headers['if-match'] && headers['if-match'] !== oldInvocation._rev) {
      return reply.code(412).error()
    }

    const authorized =
      session.token.issuer === TokenIssuer.INVOKER
        ? session.token.subject === oldInvocation.pod
        : await request.enforce('writer', oldInvocation.project)

    if (!authorized) {
      return reply.code(403).error()
    }

    if (body.status === oldInvocation.status && body.status !== 'running') {
      reply.header('etag', oldInvocation._rev)
      return { invocation: oldInvocation }
    }

    let tmp: Invocation
    switch (body.status) {
      case 'initializing':
        if (oldInvocation.status !== 'pending') {
          return reply.error({
            message: 'Expected pending Invocation.',
            statusCode: 422,
          })
        }
        tmp = handleInvocation(oldInvocation)
        break

      case 'running':
        if (oldInvocation.status === 'initializing') {
          tmp = runInvocation(oldInvocation)
        } else if (oldInvocation.status !== 'running') {
          return reply.error({
            message: 'Invalid status change.',
            statusCode: 422,
          })
        } else if (!isOlderThan(oldInvocation.updatedAt, 2)) {
          return reply.error({
            message: 'Cannot progress an Invocation too quickly.',
            statusCode: 429,
          })
        } else {
          tmp = progressInvocation(oldInvocation, body.result)
        }
        break

      case 'completed':
        if (oldInvocation.status !== 'running') {
          return reply.error({
            message: 'Invocation must be running to complete it.',
            statusCode: 422,
          })
        }
        tmp = completeInvocation(oldInvocation, body.result)
        break

      case 'failed':
        if (oldInvocation.status === 'completed') {
          return reply.error({
            message: 'Unable to fail a completed Invocation.',
            statusCode: 422,
          })
        }
        tmp = failInvocation(oldInvocation, body.reason)
        break
    }

    const fn = await store.functions
      .find(getDocumentId('function', tmp.functionName))
      .update(doc => {
        if (tmp.runtimeTest && isSameImage(doc.image, tmp.image, true)) {
          return {
            ...doc,
            runtime: getRuntime(tmp),
          }
        }
      })
      .unwrap()

    const newInvocation = await store.invocations
      .from(oldInvocation)
      .update(() => tmp)
      .unwrap()

    if (
      newInvocation.status === 'completed' ||
      newInvocation.status === 'failed'
    ) {
      await rotateInvocations(this, newInvocation, fn ? fn.historyLimit : 0)
    }

    reply.header('etag', newInvocation._rev)
    return { invocation: newInvocation }
  },
})

function getRuntime(invocation: Invocation): FnRuntime {
  if (invocation.status !== 'completed') {
    return {
      type: 'Unknown',
      invocationUlid: invocation.ulid,
    }
  }

  const runtime: any = Object(Object(invocation.result).runtime)
  if (typeof runtime.type === 'string') {
    return runtime
  } else {
    return {
      type: 'Unknown',
      invocationUlid: invocation.ulid,
    }
  }
}

async function rotateInvocations(
  { log, store }: FastifyInstance,
  invocation: Invocation,
  historyLimit: number = 10,
) {
  await store.invocations
    .filter({
      _design: 'default',
      _view: 'list_by_function',
      startkey: [invocation.functionName, 0, MAX_KEY],
      endkey: [invocation.functionName, 0, MIN_KEY],
    })
    .tap(doc => log.debug({ invocationUlid: doc.ulid }, 'delete invocation'))
    .delete()
    .unwrap({
      descending: true,
      skip: historyLimit,
    })
}
