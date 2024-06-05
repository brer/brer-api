import type { FastifyInstance } from '@brer/fastify'
import S from 'fluent-json-schema-es'

export function addSchema(fastify: FastifyInstance) {
  fastify.addSchema(v1Function())
  fastify.addSchema(v1Invocation())
  fastify.addSchema(v1Scope())
  fastify.addSchema(v1User())
}

function v1Function() {
  return S.object()
    .additionalProperties(false)
    .id('https://brer.io/schema/v1/function.json')
    .prop('_rev', S.string())
    .required()
    .prop('name', S.string())
    .description("Function's identifier.")
    .required()
    .prop('project', S.string())
    .required()
    .prop(
      'image',
      S.object()
        .additionalProperties(false)
        .prop('host', S.string())
        .required()
        .prop('name', S.string())
        .required()
        .prop('tag', S.string())
        .required(),
    )
    .required()
    .prop(
      'env',
      S.array().items(
        S.object()
          .additionalProperties(false)
          .prop('name', S.string())
          .required()
          .prop('value', S.string())
          .prop('secretName', S.string())
          .prop('secretKey', S.string()),
      ),
    )
    .prop(
      'runtime',
      S.object()
        .additionalProperties(true)
        .prop('type', S.string())
        .description(
          'Runtime type idenfitier. Special cases are `"Unknown"` and `"Failure"`.',
        )
        .required()
        .prop('result')
        .description('Invocation result when the runtime cannot be determined.')
        .prop('reason')
        .description('Invocation failure reason.'),
    )
    .prop('historyLimit', S.integer())
    .prop('timeout', S.integer().minimum(0))
    .description('Timeout in seconds since running status.')
    .prop('resources', resources())
    .description('Job resources configuration.')
    .prop('createdAt', S.string().format('date-time'))
    .required()
    .prop('updatedAt', S.string().format('date-time'))
    .required()
}

function v1Invocation() {
  return S.object()
    .additionalProperties(false)
    .id('https://brer.io/schema/v1/invocation.json')
    .prop('_rev', S.string())
    .description('Etag header.')
    .required()
    .prop('ulid', S.string())
    .description("Invocation's identifier.")
    .required()
    .prop('project', S.string())
    .required()
    .prop('functionName', S.string())
    .description('The name of the Function that generated this Invocation.')
    .required()
    .prop(
      'image',
      S.object()
        .additionalProperties(false)
        .prop('host', S.string())
        .required()
        .prop('name', S.string())
        .required()
        .prop('tag', S.string())
        .required(),
    )
    .description('Container image URL info.')
    .required()
    .prop('status', status())
    .description('Current Invocation status.')
    .required()
    .prop(
      'phases',
      S.array().items(
        S.object()
          .additionalProperties(false)
          .prop('status', status())
          .required()
          .prop('date', S.string().format('date-time'))
          .required()
          .prop('pod', S.string())
          .required()
          .prop('reason'),
      ),
    )
    .description('List of status change phases.')
    .required()
    .prop('resources', resources())
    .description('Configured job resources.')
    .prop('pod', S.string())
    .description("Active Pod's name.")
    .prop('result')
    .description('Progress or completition result value.')
    .prop('reason')
    .description('Failure reason.')
    .prop('runtimeTest', S.boolean())
    .description("This Invocation is testing its Function's image.")
    .prop('timeout', S.integer().minimum(0))
    .description('Timeout in seconds since running status.')
    .prop(
      'env',
      S.array()
        .items(
          S.object()
            .additionalProperties(false)
            .prop('name', S.string())
            .required()
            .prop('value', S.string())
            .prop('secretName', S.string())
            .prop('secretKey', S.string()),
        )
        .required(),
    )
    .prop('createdAt', S.string().format('date-time'))
    .required()
    .prop('updatedAt', S.string().format('date-time'))
    .required()
}

function status() {
  return S.string().enum([
    'pending',
    'initializing',
    'running',
    'completed',
    'failed',
    'progress',
  ])
}

function resources() {
  return S.object()
    .additionalProperties(false)
    .prop(
      'requests',
      S.object()
        .additionalProperties(false)
        .prop('cpu')
        .description('Follows Kubernetes notation.')
        .prop('memory')
        .description('Follows Kubernetes notation.'),
    )
    .description('Requested free resources before startup.')
    .prop(
      'limits',
      S.object()
        .additionalProperties(false)
        .prop('cpu')
        .description('Follows Kubernetes notation.')
        .prop('memory')
        .description('Follows Kubernetes notation.'),
    )
    .description('Resources upper limits.')
}

function v1Scope() {
  return S.object()
    .additionalProperties(false)
    .id('https://brer.io/schema/v1/scope.json')
    .prop('_rev', S.string())
    .required()
    .prop('name', S.string())
    .description("Scope's identifier.")
    .required()
    .prop('admin', S.boolean())
    .prop('role', role())
    .prop('projects', S.object().additionalProperties(role()))
    .prop('createdAt', S.string().format('date-time'))
    .required()
    .prop('updatedAt', S.string().format('date-time'))
    .required()
}

function role() {
  return S.string().enum(['reader', 'invoker', 'writer'])
}

function v1User() {
  return S.object()
    .additionalProperties(false)
    .id('https://brer.io/schema/v1/user.json')
    .prop('_rev', S.string())
    .required()
    .prop('username', S.string())
    .description("User's identifier.")
    .required()
    .prop('scope', S.string())
    .prop('expiresAt', S.string().format('date-time'))
    .description('Password expiration date.')
    .prop('createdAt', S.string().format('date-time'))
    .required()
    .prop('updatedAt', S.string().format('date-time'))
    .required()
}
