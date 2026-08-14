import { generateKeyPairSync, randomBytes } from 'node:crypto'

// Shared between provisioning (ADR 0067's initial four secrets) and
// rotate-keys (ADR 0080/0088's producer for the same three rotatable key
// purposes) -- both need to generate key material in exactly the same shape
// portcullis's own EcKeyPair/identity_hash.rs expect.

/**
 * Opaque secret bytes -- correct for identity-hash-key (an HMAC-SHA256 key,
 * any byte string works, see portcullis's identity_hash.rs) and
 * contact-hash-pepper (tower's own, never parsed by anyone else as a key of
 * any particular shape).
 */
export function randomSecret(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * A PEM-encoded P-256 (secp256r1/prime256v1) EC private key, PKCS8 shape --
 * required for session-key and internal-key specifically. Portcullis's
 * `EcKeyPair::from_pem_bytes` (authstar-middleware/src/keys.rs) parses these
 * with `jsonwebtoken`'s ES256 `EncodingKey::from_ec_pem`, which needs real EC
 * key material, not opaque random bytes -- confirmed by reading portcullis's
 * own source, not assumed. Using `randomSecret()` here instead would
 * silently break every ES256-signed session/internal JWT for the tenant the
 * moment a real portcullis instance tried to load it.
 */
export function randomEcPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return privateKey as unknown as string
}
