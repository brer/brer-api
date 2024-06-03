import type { BrerDocument } from './couchdb.js'

export interface User extends BrerDocument {
  /**
   * Identifier.
   */
  username: string
  /**
   * Password hash.
   */
  hash?: string
  /**
   * Scope's name.
   */
  scope?: string
  /**
   * Password expiration date.
   */
  expiresAt?: string
}
