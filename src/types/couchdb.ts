import type { CouchDocument } from 'mutent-couchdb'

export interface BrerDocument extends CouchDocument {
  /**
   * Make `_id` required.
   */
  _id: string
  /**
   * Document version (database versioning, see `mutent-migration` package).
   * @default 0
   */
  v?: number
  /**
   * ISO date string.
   */
  createdAt?: string
  /**
   * ISO date string.
   */
  updatedAt?: string
}
