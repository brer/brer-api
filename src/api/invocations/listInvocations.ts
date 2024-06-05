import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { asInteger } from '../../lib/qs.js'
import { TokenIssuer } from '../../lib/tokens.js'
import { MAX_KEY, MIN_KEY, getDocumentId, sSlug } from '../../lib/util.js'

export interface RouteGeneric {
  Querystring: {
    continue?: string
    direction?: 'asc' | 'desc'
    functionName?: string
    limit?: number
    project?: string
    skip?: number
    status?: 'active' | 'inactive'
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/invocations',
  config: {
    tokenIssuer: [TokenIssuer.API, TokenIssuer.INVOKER],
  },
  schema: {
    tags: ['invocation'],
    querystring: S.object()
      .additionalProperties(false)
      .prop('continue', S.string())
      .prop('direction', S.string().enum(['asc', 'desc']).default('asc'))
      .prop('functionName', sSlug())
      .prop('limit', S.integer().minimum(1).maximum(100).default(25))
      .prop('project', sSlug())
      .prop('skip', S.integer().minimum(0).maximum(100).default(0))
      .prop('status', S.string().enum(['active', 'inactive'])),
    response: {
      200: S.object()
        .additionalProperties(false)
        .prop(
          'invocations',
          S.array().items(S.ref('https://brer.io/schema/v1/invocation.json')),
        )
        .required()
        .prop('continue', S.string())
        .description(
          'You can use this token in querystring to retrieve the next page.',
        ),
    },
  },
  async preValidation(request) {
    request.query.limit = asInteger(request.query.limit)
    request.query.skip = asInteger(request.query.skip)
  },
  async handler(request, reply) {
    const { store } = this
    const { log, query, session } = request

    let reqToken: string[] = []
    if (query.continue) {
      try {
        reqToken = Buffer.from(query.continue, 'base64').toString().split(',')
      } catch (err) {
        log.debug({ err }, 'parse continue token error')
        return reply.code(400).error({ message: 'Invalid continue token.' })
      }
    }

    if (
      !query.functionName &&
      !query.project &&
      session.token.issuer !== TokenIssuer.INVOKER
    ) {
      const grants = await request.getGrants()

      if (!grants.admin && !grants.role) {
        const projects = Object.keys(grants.projects || {})

        if (!projects.length) {
          return { invocations: [] }
        } else if (projects.length === 1) {
          query.project = projects[0]
        } else {
          return reply
            .code(501)
            .error({ message: "Projects' subsets are not supported." })
        }
      }
    }

    const pick = (index: number, fallback?: unknown) =>
      index < reqToken.length ? reqToken[index] : fallback

    let view: any

    let startkey: any
    let endkey: any

    let startkey_docid: any = pick(0)
    let endkey_docid: any

    let minStatus = 0
    let maxStatus = 2
    if (query.status === 'active') {
      minStatus = 2
    } else if (query.status === 'inactive') {
      maxStatus = 0
    }

    if (query.functionName) {
      const fn = await store.functions
        .find(getDocumentId('function', query.functionName))
        .unwrap()

      let authorized = fn ? await request.enforce('reader', fn.project) : false
      if (authorized && query.project && query.project !== fn?.project) {
        authorized = false
      }
      if (!authorized || !fn) {
        return { invocations: [] }
      }

      view += 'list_by_function'
      startkey = [fn.name, minStatus, pick(1, MIN_KEY)]
      endkey = [fn.name, maxStatus, MAX_KEY]
    } else if (query.project) {
      const ok = await request.enforce('reader', query.project)
      if (!ok) {
        return { invocations: [] }
      }

      view = 'list_by_project'
      startkey = [query.project, minStatus, pick(1, MIN_KEY)]
      endkey = [query.project, maxStatus, MAX_KEY]
    } else {
      view = 'list'
      startkey = [minStatus, pick(1, MIN_KEY)]
      endkey = [maxStatus, MAX_KEY]
    }

    const limit = query.limit || 25
    const skip = query.continue ? 1 : query.skip

    const descending = query.direction === 'desc'
    if (descending) {
      const tmp = endkey
      endkey = startkey
      startkey = tmp

      endkey_docid = startkey_docid
      startkey_docid = undefined
    }

    log.trace(
      {
        view,
        startkey,
        endkey,
        startkey_docid,
        endkey_docid,
        descending,
        limit,
        skip,
      },
      'list invocations',
    )
    const invocations = await store.invocations
      .filter({
        _design: 'default',
        _view: view,
        startkey,
        endkey,
        startkey_docid,
        endkey_docid,
      })
      .unwrap({
        descending,
        limit,
        skip,
      })

    let resToken: string | undefined
    if (invocations.length === limit) {
      const { _id, createdAt, functionName, project } = invocations[limit - 1]
      resToken = Buffer.from(
        [_id, createdAt, functionName, project].join(','),
      ).toString('base64')
    }

    return {
      continue: resToken,
      invocations,
    }
  },
})
