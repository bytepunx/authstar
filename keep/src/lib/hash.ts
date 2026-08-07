import { createHash, randomBytes } from 'node:crypto'

// Usage-reporting credentials (Story 001/005) return a high-entropy secret
// once, storing only a salted hash -- "not a signet secret," held by an
// external adopting application's own backend, outside authstar's trust
// boundary entirely (ADR 0079). A single static salt (`KEEP_CREDENTIAL_SALT`
// env var, falling back to a fixed dev value) is enough to prove the
// verify-by-hash mechanism works for this pilot slice -- a real deployment
// should use a per-credential random salt, left as a follow-up (TESTING.md).
const SALT = process.env.KEEP_CREDENTIAL_SALT ?? 'keep-dev-salt'

export function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(`${SALT}:${secret}`).digest('hex')
}

export function verifySecret(secret: string, hashedSecret: string): boolean {
  return hashSecret(secret) === hashedSecret
}
