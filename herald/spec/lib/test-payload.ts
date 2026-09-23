import { encryptPayload, serializeEnvelope, type PayloadKeyring } from '../../src/lib/payload-crypto.js'

// Simulates the *publisher* side (tower/keep/portcullis in production) --
// encrypting `{ to, templateData }` with herald's current public key before
// a communication is ever ingested. Real herald never does this itself;
// this stand-in exists only so tests can construct a realistic encrypted
// `communication.encryptedPayload` without a live cross-service call.
export function buildEncryptedPayload(keyring: PayloadKeyring, to: string, templateData: Record<string, unknown>) {
  const generation = keyring.current()
  const envelope = encryptPayload(generation.publicKey, generation.version, { to, templateData })
  return { encryptedPayload: serializeEnvelope(envelope), payloadKeyVersion: generation.version }
}
