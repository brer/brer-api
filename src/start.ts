import type {} from '@fastify/swagger' // Just import types
import closeWithGrace from 'close-with-grace'

import Fastify from './server.js'

const fastify = Fastify()

const closeListeners = closeWithGrace(
  {
    delay: 30000,
    logger: fastify.log,
  },
  async ({ err, signal }: Record<string, any>) => {
    if (err) {
      fastify.log.error({ err }, 'closing because of error')
    } else if (signal) {
      fastify.log.info({ signal }, 'received signal')
    } else {
      fastify.log.info('application closed manually')
    }

    await fastify.close()
  },
)

fastify.addHook('onClose', (_, done) => {
  closeListeners.uninstall()
  done()
})

fastify.log.info('start web server')
fastify
  .listen({
    host: process.env.SERVER_HOST,
    port: parseInt(process.env.SERVER_PORT || '3000'),
  })
  .catch(err => {
    fastify.log.fatal({ err }, 'bootstrap failed')
    closeListeners.close()
  })
