import type { Fn } from '@brer/function'

import { isSameImage } from './image.js'
import { getDocumentId } from './util.js'

export function createFunction(fnName: string): Fn {
  return {
    _id: getDocumentId('function', fnName),
    env: [],
    image: {
      host: '127.0.0.1:8080',
      name: fnName,
      tag: 'latest',
    },
    name: fnName,
    project: 'default',
  }
}

export type UpdateFunctionOptions = Pick<
  Fn,
  | 'env'
  | 'historyLimit'
  | 'image'
  | 'project'
  | 'resources'
  | 'retries'
  | 'sequential'
  | 'timeout'
>

export function updateFunction(fn: Fn, options: UpdateFunctionOptions): Fn {
  const update: Fn = {
    ...fn,
    env: options.env || [],
    historyLimit: options.historyLimit || 10,
    image: options.image,
    resources: options.resources || {},
    sequential: options.sequential || false,
    retries: options.retries || 0,
  }
  if (
    !isSameImage(fn.image, update.image) ||
    update.runtime?.type === 'Unknown'
  ) {
    update.runtime = undefined
  }
  return update
}
