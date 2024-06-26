export interface AuthorizationBasic {
  type: 'basic'
  username: string
  password: string
  raw: string
}

export interface AuthorizationBearer {
  type: 'bearer'
  token: string
  raw: string
}

export type Authorization = AuthorizationBasic | AuthorizationBearer

const CREDENTIALS_REGEXP =
  /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/

const USER_PASS_REGEXP = /^([^:]*):(.*)$/

function decodeBase64(value: string) {
  return Buffer.from(value, 'base64').toString()
}

export function parseAuthorizationHeader(
  header: unknown,
): Authorization | null {
  if (typeof header == 'string') {
    const basic = CREDENTIALS_REGEXP.exec(header)
    if (basic) {
      const data = USER_PASS_REGEXP.exec(decodeBase64(basic[1]))
      if (data) {
        return {
          type: 'basic',
          username: data[1],
          password: data[2],
          raw: header,
        }
      }
    } else if (/^bearer /i.test(header)) {
      return {
        type: 'bearer',
        token: header.substring(7),
        raw: header,
      }
    }
  }
  return null
}

export function basicAuthorization(
  username?: string,
  password?: string,
): string {
  let data = ''
  if (username) {
    data += username
  }
  data += ':'
  if (password) {
    data += password
  }
  return 'Basic ' + Buffer.from(data).toString('base64')
}
