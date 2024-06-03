import type { RouteOptions } from '@brer/fastify'
import S from 'fluent-json-schema-es'

import { asInteger } from '../../lib/qs.js'
import { MAX_KEY, MIN_KEY } from '../../lib/util.js'

export interface RouteGeneric {
  Querystring: {
    continue?: string
    direction?: 'asc' | 'desc'
    project?: string
    limit?: number
    skip?: number
  }
}

export default (): RouteOptions<RouteGeneric> => ({
  method: 'GET',
  url: '/api/v1/functions',
  schema: {
    tags: ['function'],
    querystring: S.object()
      .additionalProperties(false)
      .prop('continue', S.string())
      .prop('direction', S.string().enum(['asc', 'desc']))
      .prop('project', S.string())
      .prop('limit', S.integer().minimum(1).maximum(100).default(25))
      .prop('skip', S.integer().minimum(0).maximum(100).default(0)),
    response: {
      200: S.object()
        .additionalProperties(false)
        .prop(
          'functions',
          S.array().items(S.ref('https://brer.io/schema/v1/function.json')),
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
    const { log, query } = request

    let reqToken: string[] = []
    if (query.continue) {
      try {
        reqToken = Buffer.from(query.continue, 'base64').toString().split(',')
      } catch (err) {
        log.debug({ err }, 'parse continue token error')
        return reply.code(400).error({ message: 'Invalid continue token.' })
      }
    }

    if (!query.project) {
      const grants = await request.getGrants()

      if (!grants.admin && !grants.role) {
        const projects = Object.keys(grants.projects || {})

        if (!projects.length) {
          return { functions: [] }
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

    if (query.project) {
      const ok = await request.enforce('reader', query.project)
      if (!ok) {
        return { functions: [] }
      }

      view = 'list_by_project'
      startkey = [query.project, pick(1, MIN_KEY)]
      endkey = [query.project, MAX_KEY]
    } else {
      view = 'list'
      startkey = [pick(1, MIN_KEY)]
      endkey = [MAX_KEY]
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
      'list functions',
    )

    const fns = await store.functions
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
    if (fns.length === limit) {
      const fn = fns[limit - 1]
      resToken = Buffer.from([fn._id, fn.name].join(',')).toString('base64')
    }

    return {
      continue: resToken,
      functions: fns,
    }
  },
})
