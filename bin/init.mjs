#!/usr/bin/env node

import HttpAgent, { HttpsAgent } from 'agentkeepalive'
import minimist from 'minimist'
import nano from 'nano'
import { read } from 'read'

const args = minimist(process.argv.slice(2))

const couch = await createServerScope()

console.log('test couchdb connection')
await couch.info()

const dbFunctions = couch.scope('functions')
const dbInvocations = couch.scope('invocations')
const dbScopes = couch.scope('scopes')
const dbUsers = couch.scope('users')

console.log('init databases')
await Promise.all([
  pushDatabase(dbFunctions.config.db),
  pushDatabase(dbInvocations.config.db),
  pushDatabase(dbScopes.config.db),
  pushDatabase(dbUsers.config.db),
])

const reduceArrays = `
  function (keys, values, rereduce) {
    return values.reduce((a, b) => a.concat(b), [])
  }
`

const listFunctions = `
  function (doc) {
    emit([doc.name], null)
  }
`

const listFunctionsByProject = `
  function (doc) {
    emit([doc.project, doc.name], null)
  }
`

console.log('write functions views')
await pushDocument(dbFunctions, {
  _id: '_design/default',
  views: {
    list: {
      map: listFunctions,
    },
    list_by_project: {
      map: listFunctionsByProject,
    },
  },
})

const listInvocations = `
  function (doc) {
    emit(
      [
        doc.status === 'completed' || doc.status === 'failed'
          ? 0
          : 1,
        doc.createdAt
      ],
      null
    )
  }
`

const listInvocationsByFunction = `
  function (doc) {
    emit(
      [
        doc.functionName,
        doc.status === 'completed' || doc.status === 'failed'
          ? 0
          : 1,
        doc.createdAt
      ],
      null
    )
  }
`

const listInvocationsByProject = `
  function (doc) {
    emit(
      [
        doc.project,
        doc.status === 'completed' || doc.status === 'failed'
          ? 0
          : 1,
        doc.createdAt
      ],
      null
    )
  }
`

const mapInvocationsByIdempotencyKey = `
  function (doc) {
    if (
      doc.idempotencyKey &&
      (doc.status === 'pending' || doc.status === 'initializing')
    ) {
      emit(doc.idempotencyKey, null)
    }
  }
`

console.log('write invocations views')
await pushDocument(dbInvocations, {
  _id: '_design/default',
  views: {
    list: {
      map: listInvocations,
    },
    list_by_function: {
      map: listInvocationsByFunction,
    },
    list_by_project: {
      map: listInvocationsByProject,
    },
  },
})

console.log('write default scopes')
await Promise.all([
  pushDocument(dbScopes, {
    _id: 'brer.io/scope/reader',
    name: 'reader',
    role: 'reader',
  }),
  pushDocument(dbScopes, {
    _id: 'brer.io/scope/invoker',
    name: 'invoker',
    role: 'invoker',
  }),
  pushDocument(dbScopes, {
    _id: 'brer.io/scope/writer',
    name: 'writer',
    role: 'writer',
  }),
  pushDocument(dbScopes, {
    _id: 'brer.io/scope/admin',
    name: 'admin',
    admin: true,
  }),
])

console.log('all done')

/**
 * Ask input from user, also handle "no input" sessions.
 */
async function ask(options) {
  if (args.input === false) {
    return options.default
  }
  const result = await read(options)
  if (result) {
    return result
  }
}

/**
 * Create base `nano` instance.
 */
async function createServerScope() {
  const url = await ask({
    prompt: 'couchdb url: ',
    default: args['couchdb-url'] || 'http://127.0.0.1:5984/',
    edit: true,
  })

  const username = await ask({
    prompt: 'couchdb username: ',
    default: args['couchdb-username'] || 'admin',
    edit: true,
  })

  const password = await ask({
    prompt: 'couchdb password: ',
    default: args['couchdb-password'],
    silent: true,
    replace: '*',
  })

  const agent = /^https/i.test(url) ? new HttpsAgent() : new HttpAgent()
  return nano({
    url,
    requestDefaults: {
      agent,
      auth: {
        username,
        password,
      },
      timeout: 10000,
    },
  })
}

/**
 * Push a new database and also configure `brer` member.
 */
async function pushDatabase(databaseName) {
  try {
    await couch.db.create(databaseName)
  } catch (err) {
    if (Object(err).statusCode !== 412) {
      return Promise.reject(err)
    }
  }
}

/**
 * Create or update a document by identifier (`_id` property is required).
 */
async function pushDocument(scope, doc) {
  try {
    const result = await scope.get(doc._id)
    doc = Object.assign(result, doc)
  } catch (err) {
    if (Object(err).statusCode !== 404) {
      return Promise.reject(err)
    }
  }
  await scope.insert(doc)
}
