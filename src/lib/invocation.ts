import type {
  Invocation,
  InvocationLog,
  InvocationStatus,
} from '@brer/invocation'
import type { CouchDocumentAttachment } from 'mutent-couchdb'
import { ulid } from 'ulid'

import { getDocumentId } from './util.js'
import { randomBytes } from 'node:crypto'

export type InvocationOptions = Pick<
  Invocation,
  | 'env'
  | 'functionName'
  | 'image'
  | 'project'
  | 'resources'
  | 'retries'
  | 'runtimeTest'
>

export function createInvocation(
  options: InvocationOptions,
  payload?: Buffer,
  contentType?: string,
): Invocation {
  const attachments: Record<string, CouchDocumentAttachment> = {}
  const id = ulid().toLowerCase()
  const now = new Date()
  const status = 'pending'
  const pod = getPodName(options.functionName)

  if (payload?.byteLength) {
    attachments.payload = {
      content_type: contentType || 'application/octet-stream',
      data: payload.toString('base64'),
    }
  }

  return {
    _attachments: attachments,
    _id: getDocumentId('invocation', id),
    ulid: id,
    env: options.env,
    functionName: options.functionName,
    image: options.image,
    phases: [
      {
        date: now.toISOString(),
        status,
        pod,
      },
    ],
    project: options.project,
    status,
    resources: options.resources,
    pod,
    retries: options.retries,
    runtimeTest: options.runtimeTest,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

function pushStatus(
  invocation: Invocation,
  status: InvocationStatus,
): Invocation {
  return {
    ...invocation,
    phases: [
      ...invocation.phases,
      {
        date: new Date().toISOString(),
        status,
        pod: invocation.pod,
        reason: status === 'failed' ? invocation.reason : undefined,
      },
    ],
    status,
  }
}

function getPodName(functionName: string) {
  return `fn-${functionName}-${randomBytes(4).toString('hex')}`
}

/**
 * From `pending` to `initializing`.
 */
export function handleInvocation(invocation: Invocation): Invocation {
  if (invocation.status !== 'pending') {
    throw new Error('Expected pending Invocation')
  }
  return pushStatus(invocation, 'initializing')
}

/**
 * From `initializing` (or `failed`) to `running`.
 */
export function runInvocation(invocation: Invocation): Invocation {
  if (invocation.status !== 'initializing') {
    throw new Error('Expected initializing Invocation')
  }
  return pushStatus(invocation, 'running')
}

/**
 * Set a "partial result" during the `running` status.
 */
export function progressInvocation(
  invocation: Invocation,
  result: unknown = null,
): Invocation {
  if (invocation.status !== 'running') {
    throw new Error('Expected running Invocation')
  }

  const phases = invocation.phases.filter(p => p.status !== 'progress')
  return {
    ...invocation,
    result,
    phases: [
      ...phases,
      {
        date: new Date().toISOString(),
        status: 'progress',
        pod: invocation.pod,
      },
    ],
  }
}

/**
 * Move Invocation from "running" to "completed" status.
 */
export function completeInvocation(
  invocation: Invocation,
  result: unknown = null,
): Invocation {
  if (invocation.status !== 'running') {
    throw new Error('Expected running Invocation')
  }
  return pushStatus({ ...invocation, result }, 'completed')
}

/**
 * Move Invocation from any other status to "failed" status.
 */
export function failInvocation(
  invocation: Invocation,
  reason: unknown,
): Invocation {
  if (invocation.status === 'completed') {
    throw new Error('Unexpected Invocation status')
  }

  invocation = pushStatus(
    {
      ...invocation,
      reason,
      result: undefined, // remove past progress
    },
    'failed',
  )
  if (!invocation.retries) {
    return invocation
  }

  const attachments = { ...invocation._attachments }
  if (invocation.logs) {
    for (const log of invocation.logs) {
      delete attachments[log.attachment]
    }
  }

  return pushStatus(
    {
      ...invocation,
      _attachments: attachments,
      logs: [],
      pod: getPodName(invocation.functionName),
      reason: undefined,
      result: undefined,
      retries: invocation.retries - 1,
    },
    'pending',
  )
}

export function pushLogPage(
  doc: Invocation,
  buffer: Buffer,
  index: number,
): Invocation {
  const now = new Date()

  // actual attachment name to use (default to this value, or retrived from previous value)
  let attachment = `page_${index}.txt`

  const logs: InvocationLog[] = []
  if (doc.logs) {
    for (const obj of doc.logs) {
      if (obj.index === index) {
        attachment = obj.attachment
      } else {
        logs.push(obj)
      }
    }
  }
  logs.push({
    attachment,
    date: now.toISOString(),
    index,
  })
  logs.sort((a, b) => a.index - b.index)

  return {
    ...doc,
    _attachments: {
      ...doc._attachments,
      [attachment]: {
        content_type: 'text/plain; charset=utf-8',
        data: buffer.toString('base64'),
      },
    },
    logs,
    updatedAt: now.toISOString(),
  }
}
