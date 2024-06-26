import type { FastifyInstance } from '@brer/fastify'
import type { BrerDocument } from '@brer/couchdb'
import type { Fn } from '@brer/function'
import type { Invocation } from '@brer/invocation'
import type { Scope } from '@brer/scope'
import type { User } from '@brer/user'
import HttpAgent, { HttpsAgent } from 'agentkeepalive'
import plugin from 'fastify-plugin'
import { Entity, Store, StoreOptions } from 'mutent'
import CouchAdapter, {
  type CouchGenerics,
  type CouchStore,
} from 'mutent-couchdb'
import { MigrationStrategy, mutentMigration } from 'mutent-migration'
import nano from 'nano'

declare module 'fastify' {
  interface FastifyInstance {
    store: {
      nano: nano.ServerScope
      functions: CouchStore<Fn>
      invocations: CouchStore<Invocation>
      scopes: CouchStore<Scope>
      users: CouchStore<User>
    }
  }
}

export interface PluginOptions {
  url?: string
  username?: string
  password?: string
}

export function createFastifyStore(
  options: PluginOptions,
): FastifyInstance['store'] {
  const couchUrl = options.url || 'http://127.0.0.1:5984/'
  const agent = /^https/.test(couchUrl) ? new HttpsAgent() : new HttpAgent() // TODO: agent options?

  const serverScope = nano({
    url: couchUrl,
    requestDefaults: {
      agent,
      auth: {
        password: options.password || '',
        username: options.username || '',
      },
      timeout: 30000, // CouchDB should be fast :)
    },
  })

  const hooks: StoreOptions<CouchGenerics<any>>['hooks'] = {
    beforeCreate(entity: Entity<BrerDocument>) {
      if (!entity.target.createdAt) {
        entity.target.createdAt =
          entity.target.updatedAt || new Date().toISOString()
      }
      if (!entity.target.updatedAt) {
        entity.target.updatedAt = entity.target.createdAt
      }
    },
    beforeUpdate(entity: Entity<BrerDocument>) {
      if (entity.target.updatedAt === entity.source!.updatedAt) {
        entity.target.updatedAt = new Date().toISOString()
      }
    },
  }

  const getStore = (
    databaseName: string,
    version: number = 0,
    strategies: Record<number, MigrationStrategy<CouchGenerics<any>>> = {},
  ) => {
    return new Store({
      adapter: new CouchAdapter({
        databaseName,
        serverScope,
      }),
      hooks,
      plugins: [
        mutentMigration<CouchGenerics<any>>({
          key: 'v',
          version,
          strategies,
        }),
      ],
    })
  }

  return {
    nano: serverScope,
    functions: getStore('functions', 2),
    invocations: getStore('invocations', 2),
    scopes: getStore('scopes'),
    users: getStore('users'),
  }
}

async function storePlugin(fastify: FastifyInstance, options: PluginOptions) {
  fastify.decorate('store', createFastifyStore(options))

  // Test CouchDB server
  fastify.addHook('onReady', async () => {
    try {
      await fastify.store.nano.info()
    } catch (err) {
      fastify.log.error({ err }, 'raw couchdb error')
      return Promise.reject(new Error('CouchDB connection failure'))
    }
  })
}

export default plugin(storePlugin, {
  name: 'store',
})
