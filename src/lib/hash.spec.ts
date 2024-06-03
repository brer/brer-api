import test from 'ava'

import { hashSecret, verifySecret } from './hash.js'

test('hash', async t => {
  const hash = await hashSecret("Epstein didn't kill himself")

  const ok = await verifySecret("Epstein didn't kill himself", hash)
  t.true(ok)

  const ko = await verifySecret('Edward Joseph Snowden', hash)
  t.false(ko)
})
