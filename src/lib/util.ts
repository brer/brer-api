import S from 'fluent-json-schema-es'

/**
 * date is older than seconds
 */
export function isOlderThan(
  date: Date | string | number = Number.POSITIVE_INFINITY,
  seconds: number,
): boolean {
  if (seconds <= 0) {
    return true
  }
  if (typeof date === 'string') {
    date = new Date(date)
  }
  if (date instanceof Date) {
    date = date.getTime()
  }
  return date < Date.now() - seconds * 1000
}

/**
 * Get CouchDB Document's identifier.
 */
export function getDocumentId(
  kind: 'function' | 'invocation' | 'scope' | 'user',
  id: string,
) {
  return `brer.io/${kind}/${id}`
}

/**
 * URL friendly string JSON Schema.
 */
export function sSlug(maxLength: number = 256) {
  return S.string()
    .minLength(3)
    .maxLength(maxLength)
    .pattern(/^[a-z][0-9a-z\-]+[0-9a-z]$/)
}

/**
 * @see https://docs.couchdb.org/en/stable/ddocs/views/collation.html#collation-specification
 */
export const MAX_KEY = {}

/**
 * @see https://docs.couchdb.org/en/stable/ddocs/views/collation.html#collation-specification
 */
export const MIN_KEY = null
