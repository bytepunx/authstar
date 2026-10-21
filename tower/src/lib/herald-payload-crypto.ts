import { constants, generateKeyPairSync, publicEncrypt, randomBytes, createCipheriv, createPublicKey, type KeyObject } from 'node:crypto'

// Publisher-side half of herald's payload-encryption envelope (ADR 0025,
// design/adrs/0025-versioned-templates-and-encrypted-payloads.md).
// Herald holds the private key; every publisher (tower, keep, portcullis)
// only ever needs herald's *public* key to encrypt. Algorithm mirrored
// byte-for-byte from herald's own `payload-crypto.ts` `encryptPayload` --
// RSA-OAEP-SHA256 wrapping a fresh random AES-256-GCM key per message --
// so an envelope produced here is directly decryptable by herald's
// `decryptPayload`, not just structurally similar.
//
// Real deployment fetches herald's current public key (and its version)
// from signet -- the same "public key distributed via signet" gap ADR
// 0025 itself names, and the same class of documented-but-unwired gap
// herald's own `payload-crypto.ts` flags for its own key generation.
// `createEphemeralHeraldKey` below stands in for that until live
// cross-service key distribution exists; production code should replace
// it with a real signet-sourced key, not generate its own.

export interface EncryptedEnvelope {
  keyVersion: number
  wrappedKey: string
  iv: string
  authTag: string
  ciphertext: string
}

export interface HeraldPayloadKey {
  version: number
  publicKey: KeyObject
}

// Stand-in for a real signet-sourced key (see header comment) -- generates
// a throwaway keypair and discards the private half immediately, since
// tower never needs it. Only useful for tests/dev; a real deployment must
// inject a real `HeraldPayloadKey` sourced from signet instead.
export function createEphemeralHeraldKey(version = 1): HeraldPayloadKey {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { version, publicKey }
}

export function heraldKeyFromPem(version: number, publicKeyPem: string): HeraldPayloadKey {
  return { version, publicKey: createPublicKey(publicKeyPem) }
}

export function encryptForHerald(key: HeraldPayloadKey, payload: unknown): EncryptedEnvelope {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const aesKey = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const wrappedKey = publicEncrypt(
    { key: key.publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    aesKey,
  )
  return {
    keyVersion: key.version,
    wrappedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope)
}
