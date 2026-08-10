import { describe, it, expect } from 'vitest'
import { constants, generateKeyPairSync, privateDecrypt, createDecipheriv } from 'node:crypto'
import { encryptForHerald, serializeEnvelope, type EncryptedEnvelope, type HeraldPayloadKey } from '../../src/lib/herald-payload-crypto.js'

// Proves `encryptForHerald`'s envelope is genuinely decryptable by
// herald's own algorithm (RSA-OAEP-SHA256-wrapped AES-256-GCM, per ADR
// 0025 and herald's own `payload-crypto.ts` `decryptPayload`), not just
// structurally plausible. `HeraldPayloadKey` only ever exposes a public
// `KeyObject` (tower has no business holding herald's private key) -- this
// test generates its own full keypair locally, purely to stand in for
// herald's side of the exchange and confirm the wire format round-trips.

function decryptLikeHerald(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], envelope: EncryptedEnvelope): unknown {
  const aesKey = privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(envelope.wrappedKey, 'base64'),
  )
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

describe('encryptForHerald', () => {
  it('produces an envelope herald\'s own RSA-OAEP+AES-256-GCM algorithm can genuinely decrypt', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const key: HeraldPayloadKey = { version: 3, publicKey }

    const payload = { tenantName: 'Acme', token: 'abc123', adminHost: 'admin.acme.authstar.test' }
    const envelope = encryptForHerald(key, payload)

    expect(envelope.keyVersion).toBe(3)
    const decrypted = decryptLikeHerald(privateKey, envelope)
    expect(decrypted).toEqual(payload)
  })

  it('serializes to a JSON string carrying all four envelope fields', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const envelope = encryptForHerald({ version: 1, publicKey }, { a: 1 })
    const serialized = serializeEnvelope(envelope)
    const parsed = JSON.parse(serialized)
    expect(Object.keys(parsed).sort()).toEqual(['authTag', 'ciphertext', 'iv', 'keyVersion', 'wrappedKey'])
  })

  it('a different keypair cannot decrypt -- the wrapped key is genuinely bound to the recipient public key', () => {
    const recipient = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const envelope = encryptForHerald({ version: 1, publicKey: recipient.publicKey }, { secret: true })
    expect(() => decryptLikeHerald(attacker.privateKey, envelope)).toThrow()
  })
})
