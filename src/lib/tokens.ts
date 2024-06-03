import type { FastifyInstance } from '@brer/fastify'
import plugin from 'fastify-plugin'
import {
  errors as JoseErrors,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type KeyLike,
  SignJWT,
} from 'jose'
import { readFile } from 'node:fs/promises'
import { ulid } from 'ulid'

export const TokenIssuer = {
  API: 'brer.io/api',
  INVOKER: 'brer.io/invoker',
}

const ALG_ASYMMETHRIC = 'RS256'
const ALG_SYMMETHRIC = 'HS256'

export interface Token {
  id: string
  subject: string
  raw: string
  issuer: string
}

async function verifyToken(
  jwt: string,
  key: KeyLike | Uint8Array,
  audience: string,
  issuer?: string | string[],
): Promise<Token> {
  const { payload } = await jwtVerify(jwt, key, {
    algorithms: [ALG_SYMMETHRIC, ALG_ASYMMETHRIC],
    issuer,
    audience,
  })

  return {
    id: payload.jti || ulid().toLowerCase(),
    issuer: payload.iss || '',
    raw: jwt,
    subject: payload.sub || '',
  }
}

function getAlgorithm(key: KeyLike | Uint8Array) {
  return Symbol.iterator in key ? ALG_SYMMETHRIC : ALG_ASYMMETHRIC
}

export interface SignedToken extends Token {
  /**
   * Seconds.
   */
  expiresIn: number
  /**
   * ISO date.
   */
  issuedAt: Date
}

/**
 * Returns seconds since UNIX epoch.
 */
function getExpirationTime(date: Date, seconds: number) {
  return Math.floor(date.getTime() / 1000) + seconds
}

async function signApiToken(
  key: KeyLike | Uint8Array,
  subject: string,
): Promise<SignedToken> {
  const id = ulid().toLowerCase()
  const issuedAt = new Date()
  const expiresIn = 604800 // 7 days (seconds)

  const raw = await new SignJWT()
    .setProtectedHeader({ alg: getAlgorithm(key) })
    .setIssuedAt()
    .setExpirationTime(getExpirationTime(issuedAt, expiresIn))
    .setJti(id)
    .setIssuer(TokenIssuer.API)
    .setAudience(TokenIssuer.API)
    .setSubject(subject)
    .sign(key)

  return {
    expiresIn,
    id,
    issuedAt,
    issuer: TokenIssuer.API,
    raw,
    subject,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    tokens: {
      signApiToken(subject: string): Promise<SignedToken>
      verifyToken(
        raw: string,
        audience: string,
        issuer?: string | string[],
      ): Promise<Token>
    }
  }
}

export interface PluginOptions {
  /**
   * Symmetric secret.
   */
  secret?: string
  /**
   * PKCS8 PEM filepath.
   */
  privateKey?: string
  /**
   * SPKI PEM filepath.
   */
  publicKeys?: string[]
}

async function tokenPlugin(fastify: FastifyInstance, options: PluginOptions) {
  const { privateKey, publicKeys } = await createKeys(options)

  const decorator: FastifyInstance['tokens'] = {
    signApiToken(subject) {
      return signApiToken(privateKey, subject)
    },
    async verifyToken(
      jwt: string,
      audience: string,
      issuer?: string | string[],
    ) {
      for (const key of publicKeys) {
        try {
          return await verifyToken(jwt, key, audience, issuer)
        } catch (err) {
          if (!(err instanceof JoseErrors.JWSSignatureVerificationFailed)) {
            return Promise.reject(err)
          }
        }
      }
      throw new Error('Foreign token detected')
    },
  }

  fastify.decorate('tokens', decorator)
}

interface FastifyKeys {
  privateKey: KeyLike | Uint8Array
  publicKeys: Array<KeyLike | Uint8Array>
}

async function createKeys(options: PluginOptions): Promise<FastifyKeys> {
  if (options.privateKey) {
    if (!options.publicKeys?.length) {
      throw new Error('Public key is missing')
    }

    const privateKey = await importPKCS8(
      await readFile(options.privateKey, 'utf-8'),
      ALG_ASYMMETHRIC,
    )
    const publicKeys: Array<KeyLike | Uint8Array> = await Promise.all(
      options.publicKeys.map(file =>
        readFile(file, 'utf-8').then(key => importSPKI(key, ALG_ASYMMETHRIC)),
      ),
    )
    if (options.secret) {
      publicKeys.push(Buffer.from(options.secret))
    }

    return { privateKey, publicKeys }
  } else if (options.secret) {
    const key = Buffer.from(options.secret)

    return {
      privateKey: key,
      publicKeys: [key],
    }
  } else {
    throw new Error('Specify JWT secret or certificate')
  }
}

export default plugin(tokenPlugin, {
  name: 'tokens',
})
