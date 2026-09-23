import { randomBytes, createHash } from 'node:crypto'

// Per design/decisions/0101-api-keys.md. A deliberate improvement over
// keep's usage-reporting credential (ADR 0079, `keep/src/lib/hash.ts`),
// which hashes with one static, deployment-wide salt
// (`KEEP_CREDENTIAL_SALT`) -- a known, explicitly-flagged shortcut there.
// Every API key here gets its own random salt, stored alongside the hash,
// so a leaked hash table alone (without the individual salts) is useless
// for even a rainbow-table attack against the whole set at once.
//
// Deliberately does not import keep's `hash.ts` directly -- separate
// services, separate secret material, no reason to couple them.

export function generateApiKeySecret(): string {
  return randomBytes(32).toString('base64url') // 256 bits
}

export function generateApiKeySalt(): string {
  return randomBytes(16).toString('hex')
}

export function hashApiKeySecret(secret: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${secret}`).digest('hex')
}

export function verifyApiKeySecret(secret: string, salt: string, hashedSecret: string): boolean {
  return hashApiKeySecret(secret, salt) === hashedSecret
}
