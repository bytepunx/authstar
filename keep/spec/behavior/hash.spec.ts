import { describe, expect, it } from 'vitest'
import { createSecretHasher } from '../../src/lib/hash.js'

// Behavior tier for `createSecretHasher` (ADR 0102 / Story 008): the salt
// used to hash usage-reporting-credential secrets moved from a top-of-file
// `process.env.KEEP_CREDENTIAL_SALT ?? 'keep-dev-salt'` read (executed once,
// at import time, before src/server.ts even had a chance to dial signet)
// into a constructor argument the caller supplies -- `src/server.ts` sources
// it from the signet bundle/secrets (`credentialSalt`, same pattern as
// `dbConnectionString`/`rabbitmqUrl`) and fails startup loudly if it's
// absent, rather than silently falling back to a hardcoded dev value.

describe('createSecretHasher', () => {
  it('generates a high-entropy, URL-safe secret', () => {
    const hasher = createSecretHasher('some-salt')
    const secret = hasher.generateSecret()
    expect(secret.length).toBeGreaterThan(30)
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hasher.generateSecret()).not.toBe(secret)
  })

  it('hashSecret is deterministic for the same salt and secret', () => {
    const hasher = createSecretHasher('some-salt')
    expect(hasher.hashSecret('my-secret')).toBe(hasher.hashSecret('my-secret'))
  })

  it('hashSecret produces a different digest for a different salt -- the salt actually participates in the hash', () => {
    const a = createSecretHasher('salt-a')
    const b = createSecretHasher('salt-b')
    expect(a.hashSecret('my-secret')).not.toBe(b.hashSecret('my-secret'))
  })

  it('verifySecret accepts the matching secret and rejects a wrong one', () => {
    const hasher = createSecretHasher('some-salt')
    const hashed = hasher.hashSecret('correct-secret')
    expect(hasher.verifySecret('correct-secret', hashed)).toBe(true)
    expect(hasher.verifySecret('wrong-secret', hashed)).toBe(false)
  })

  it('a hash produced under one salt does not verify under a hasher constructed with a different salt', () => {
    const issued = createSecretHasher('salt-a')
    const other = createSecretHasher('salt-b')
    const hashed = issued.hashSecret('my-secret')
    expect(other.verifySecret('my-secret', hashed)).toBe(false)
  })
})
