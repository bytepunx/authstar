import { createHash, randomBytes } from 'node:crypto'

// Usage-reporting credentials (Story 001/005) return a high-entropy secret
// once, storing only a salted hash. The salt itself never leaves keep's own
// trust boundary (it's used to hash the secret, it isn't the secret, and it
// never travels to the external adopting application that holds the actual
// credential) -- so it's sourced from signet the same way as keep's other
// secrets (`dbConnectionString`/`rabbitmqUrl` in `src/server.ts`), per ADR
// 0102's Signet-Configured-Mode precedence/fail-loud rule, rather than a
// standalone env var. A single static salt is enough to prove the
// verify-by-hash mechanism works for this pilot slice -- a real deployment
// should use a per-credential random salt, left as a follow-up (TESTING.md).
export interface SecretHasher {
  generateSecret(): string
  hashSecret(secret: string): string
  verifySecret(secret: string, hashedSecret: string): boolean
}

// Takes the salt at construction time (sourced from signet by `src/server.ts`
// and threaded through `buildApp`/`app.secretHasher`, same dependency-
// injection shape as `createSignetStripeConfigStore`) rather than reading
// `process.env` at import time -- so a missing salt fails startup loudly,
// where it's caught, instead of silently baking a wrong value into every
// hash computed for the life of the process.
export function createSecretHasher(salt: string): SecretHasher {
  function hashSecret(secret: string): string {
    return createHash('sha256').update(`${salt}:${secret}`).digest('hex')
  }

  return {
    generateSecret(): string {
      return randomBytes(32).toString('base64url')
    },
    hashSecret,
    verifySecret(secret: string, hashedSecret: string): boolean {
      return hashSecret(secret) === hashedSecret
    },
  }
}
