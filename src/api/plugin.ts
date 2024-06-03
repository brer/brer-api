import type { FastifyInstance } from '@brer/fastify'
import plugin from 'fastify-plugin'

import deleteFunctionV1 from './functions/deleteFunction.js'
import listFunctionsV1 from './functions/listFunctions.js'
import readFunctionV1 from './functions/readFunction.js'
import triggerFunctionV1 from './functions/triggerFunction.js'
import updateFunctionV1 from './functions/updateFunction.js'

import deleteInvocationV1 from './invocations/deleteInvocation.js'
import listInvocationsV1 from './invocations/listInvocations.js'
import pushLogV1 from './invocations/pushLog.js'
import readInvocationV1 from './invocations/readInvocation.js'
import readLogsV1 from './invocations/readLogs.js'
import readPayloadV1 from './invocations/readPayload.js'
import updateInvocationV1 from './invocations/updateInvocation.js'

import deleteScopeV1 from './scopes/deleteScope.js'
import listScopesV1 from './scopes/listScopes.js'
import updateScopeV1 from './scopes/updateScope.js'

import createSessionV1 from './session/createSession.js'
import readSessionV1 from './session/readSession.js'

import deleteUserV1 from './users/deleteUser.js'
import listUsersV1 from './users/listUsers.js'
import updateUserV1 from './users/updateUser.js'

async function apiPlugin(fastify: FastifyInstance) {
  fastify
    .route(deleteFunctionV1())
    .route(listFunctionsV1())
    .route(readFunctionV1())
    .register(triggerFunctionV1)
    .route(updateFunctionV1())

  fastify
    .route(deleteInvocationV1())
    .route(listInvocationsV1())
    .route(readInvocationV1())
    .route(readLogsV1())
    .route(pushLogV1())
    .route(readPayloadV1())
    .route(updateInvocationV1())

  fastify.route(deleteScopeV1()).route(listScopesV1()).route(updateScopeV1())

  fastify.route(createSessionV1()).route(readSessionV1())

  fastify.route(deleteUserV1()).route(listUsersV1()).route(updateUserV1())
}

export default plugin(apiPlugin, {
  name: 'api',
})
