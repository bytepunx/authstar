// Stateless, signed unsubscribe token (Story 001 "Unsubscribe Token"
// section). Claim shape: `{ tenant, contactId, category, keyVersion }`.
// No database record -- unsubscribing is one-shot idempotent, verified
// entirely by signature. The signing key is a dedicated HMAC key, distinct
// from the payload-encryption keypair (explicit key-separation discipline
// per Story 001). Signet isn't available in this dev environment, so --
// same as `payload-crypto.ts` -- this keyring is generated in-process and
// never persisted; real deployment sources it from signet.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface UnsubscribeClaims {
  tenant: string
  contactId: string
  category: string
  keyVersion: number
}

// A signet-sourced generation, as it would arrive decoded out of the
// bundle's secrets -- same "no ADR names the actual schema yet" caveat as
// `payload-crypto.ts`'s `PersistedPayloadKeyGeneration`.
export interface PersistedUnsubscribeKeyGeneration {
  version: number
  keyBase64: string
}

// Never automatically pruned (Story 001) -- an unsubscribe link's real
// lifetime has no reliable bound. Verification checks every generation
// still held, not a fixed overlap window.
export class UnsubscribeKeyring {
  private generations = new Map<number, Buffer>()
  private currentVersion = 0

  // Same additive convention as `PayloadKeyring`: no-arg generates one
  // fresh ephemeral key (every existing caller); `seed` (real deployment,
  // sourced from signet by `server.ts`) imports persisted key material
  // instead, so a restart doesn't invalidate every unsubscribe link already
  // mailed out under an old generation.
  constructor(seed?: PersistedUnsubscribeKeyGeneration[]) {
    if (seed && seed.length > 0) {
      for (const generation of seed) {
        this.generations.set(generation.version, Buffer.from(generation.keyBase64, 'base64'))
        if (generation.version > this.currentVersion) this.currentVersion = generation.version
      }
    } else {
      this.rotate()
    }
  }

  rotate(): number {
    this.currentVersion += 1
    this.generations.set(this.currentVersion, randomBytes(32))
    return this.currentVersion
  }

  current(): number {
    return this.currentVersion
  }

  keyFor(version: number): Buffer | undefined {
    return this.generations.get(version)
  }

  // Every generation still held, current-first (ADR 0081) -- the rotation
  // route persists this full set back to signet after each `rotate()`
  // call, so a restart doesn't invalidate an unsubscribe link mailed out
  // under an old, still-unpruned generation.
  allGenerations(): Array<{ version: number, key: Buffer }> {
    return [...this.generations.entries()]
      .map(([version, key]) => ({ version, key }))
      .sort((a, b) => b.version - a.version)
  }

  // Manual pruning of a specific old generation is a separate, explicit,
  // risk-accepting operator action (Story 001) -- never a byproduct of
  // routine rotation, so this is never called automatically.
  prune(version: number): void {
    this.generations.delete(version)
  }
}

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

function sign(keyring: UnsubscribeKeyring, claims: UnsubscribeClaims): string {
  const key = keyring.keyFor(claims.keyVersion)
  if (!key) throw new Error(`no unsubscribe signing key for version ${claims.keyVersion}`)
  const payload = base64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = createHmac('sha256', key).update(payload).digest()
  return `${payload}.${base64url(mac)}`
}

export function issueToken(keyring: UnsubscribeKeyring, tenant: string, contactId: string, category: string): string {
  const claims: UnsubscribeClaims = { tenant, contactId, category, keyVersion: keyring.current() }
  return sign(keyring, claims)
}

export function verifyToken(keyring: UnsubscribeKeyring, token: string): UnsubscribeClaims | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, mac] = parts
  let claims: UnsubscribeClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const key = keyring.keyFor(claims.keyVersion)
  if (!key) return null // generation no longer held (manually pruned) -- fails closed
  const expected = createHmac('sha256', key).update(payload).digest()
  const provided = Buffer.from(mac, 'base64url')
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null
  return claims
}
