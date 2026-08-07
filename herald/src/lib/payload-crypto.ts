// Herald's payload-encryption keypair (Story 001: "pure signet secrets, no
// queryable actor at all" -- public key distributed to publishers via
// signet, private key herald-only). Signet isn't available in this dev
// environment, so this module is an in-process stand-in: a versioned
// keyring generated at process start (or per-test), never persisted. Real
// deployment fetches these from signet's admin/workload dial instead of
// generating them here -- that wiring is a documented gap, not implemented.
//
// RSA-OAEP alone can't encrypt an arbitrary-size `{ to, templateData }`
// payload (2048-bit OAEP-SHA256 tops out around 190 bytes of plaintext), so
// this is a standard hybrid "envelope" scheme: a fresh random AES-256-GCM
// key per message, wrapped with the recipient's RSA public key. Anyone
// holding the public key (a publisher, e.g. tower) can encrypt; only the
// keyring's owner (herald) can unwrap and decrypt.
import { constants, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes, createCipheriv, createDecipheriv, type KeyObject } from 'node:crypto'

export interface PayloadKeyGeneration {
  version: number
  publicKey: KeyObject
  privateKey: KeyObject
}

export interface EncryptedEnvelope {
  keyVersion: number
  wrappedKey: string // base64 RSA-OAEP-wrapped AES key
  iv: string // base64
  authTag: string // base64
  ciphertext: string // base64
}

// A versioned keyring, mirroring how `kid`-based JWT key rotation is
// described elsewhere in the design (Story 001's own analogy). `current`
// is always the highest version generated so far.
export class PayloadKeyring {
  private generations = new Map<number, PayloadKeyGeneration>()
  private currentVersion = 0

  constructor() {
    this.rotate()
  }

  rotate(): PayloadKeyGeneration {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    this.currentVersion += 1
    const generation: PayloadKeyGeneration = { version: this.currentVersion, publicKey, privateKey }
    this.generations.set(this.currentVersion, generation)
    return generation
  }

  current(): PayloadKeyGeneration {
    return this.generations.get(this.currentVersion)!
  }

  get(version: number): PayloadKeyGeneration | undefined {
    return this.generations.get(version)
  }

  // Retention-sweep pruning (ADR 0029/0081) piggybacks on the last
  // referencing `communication`'s payload purge -- not implemented here
  // (no scheduled sweep in this slice), but exposed so a future sweep can
  // call it once nothing references a generation anymore.
  prune(version: number): void {
    if (version === this.currentVersion) return // never prune the current generation
    this.generations.delete(version)
  }
}

// Publisher-side helper -- in production this logic lives in tower/keep/
// portcullis, using herald's *public* key distributed via signet. Exposed
// here only so tests can simulate "a publisher encrypted this payload"
// without a live cross-service call.
export function encryptPayload(publicKey: KeyObject, version: number, payload: unknown): EncryptedEnvelope {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const aesKey = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const wrappedKey = publicEncrypt(
    { key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    aesKey,
  )
  return {
    keyVersion: version,
    wrappedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

// Herald-side: decrypt using the record's own `payloadKeyVersion` (Story
// 001/002) -- never a different generation, even if a newer one is current.
export function decryptPayload(privateKey: KeyObject, envelope: EncryptedEnvelope): unknown {
  const aesKey = privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(envelope.wrappedKey, 'base64'),
  )
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope)
}

export function deserializeEnvelope(serialized: string): EncryptedEnvelope {
  return JSON.parse(serialized) as EncryptedEnvelope
}
