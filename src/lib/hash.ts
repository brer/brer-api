import { randomBytes, scrypt } from 'node:crypto'

async function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret,
      salt,
      64,
      {
        blockSize: 8,
        cost: 65536, // 2^16
        maxmem: 134217728, // 128 MiB
        parallelization: 1,
      },
      (err, key) => {
        if (err) {
          reject(err)
        } else {
          resolve(key)
        }
      },
    )
  })
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(secret, salt)
  return `$1$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifySecret(
  secret: string,
  hash: string,
): Promise<boolean> {
  const chunks = hash.split('$')
  if (chunks.length !== 4 || chunks[0] !== '' || chunks[1] !== '1') {
    return false
  }

  const key = await derive(secret, Buffer.from(chunks[2], 'hex'))
  return key.toString('hex') === chunks[3]
}
