import type { BrerDocument } from './couchdb.js'

export interface Scope extends BrerDocument {
  /**
   * URL friendly name.
   */
  name: string
  /**
   * Grants write access to all resources, Scopes and Tokens included.
   */
  admin?: boolean
  /**
   * Role applied to all projects.
   */
  role?: Role
  /**
   * Roles and projects mapping.
   */
  projects?: Record<string, Role>
}

/**
 * - `reader`: read-only
 * - `invoker`: read and trigger functions
 * - `writer`: read and write resources
 */
export type Role = 'reader' | 'invoker' | 'writer'
