//! ES256 (P-256) keypair handling for portcullis's own JWT signing/verification.
//!
//! Signet hands us key material as a single PEM-encoded EC private key per secret name (Story
//! 008: `tenant-<slug>-session-key`, `tenant-<slug>-internal-key`) — no separate public-key
//! secret, no explicit multi-generation naming for these two key purposes (unlike the identity
//! hash key, which *does* have explicit `-<version>` generations, see `identity_hash.rs`).
//!
//! `jsonwebtoken`'s `EncodingKey::from_ec_pem`/`DecodingKey::from_ec_pem` (backed by `ring`)
//! expect PKCS8 for the private key and SPKI for the public key specifically — accepting
//! whichever PEM shape (SEC1 `EC PRIVATE KEY` or PKCS8 `PRIVATE KEY`) the secret happens to be
//! in, and deriving the SPKI public key ourselves, means we don't have to dictate the exact PEM
//! flavor whoever provisions signet's secrets used. We do that via `p256`, which round-trips
//! both PEM shapes and lets us re-encode into whatever `jsonwebtoken` wants.
//!
//! Judgment call, documented here and in TESTING.md: true zero-downtime key rotation-with-
//! overlap (verify against *both* a current and a still-valid previous key) isn't implemented,
//! because the bundle shape only exposes one secret name per key purpose per tenant — there's no
//! `-previous` or `-<version>` sibling for session/internal keys the way there is for identity
//! hash keys. Rotation instead happens the same way every other bundle change does: signet
//! reports a change, portcullis acquires the restart lock, exits, and the next process picks up
//! the new key. Sessions signed under the old key stop verifying at that point — an accepted
//! trade-off given the scope of this pass, not an oversight.

use base64::Engine;
use jsonwebtoken::{DecodingKey, EncodingKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use p256::SecretKey;
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum KeyError {
    #[error("key material is not valid UTF-8 PEM")]
    NotUtf8,
    #[error("failed to parse EC private key (tried PKCS8 and SEC1): {0}")]
    Parse(String),
    #[error("failed to re-encode private key as PKCS8 PEM: {0}")]
    EncodePrivate(String),
    #[error("failed to re-encode public key as SPKI PEM: {0}")]
    EncodePublic(String),
    #[error("jsonwebtoken rejected the re-encoded key: {0}")]
    Jsonwebtoken(#[from] jsonwebtoken::errors::Error),
}

/// One ES256 keypair, ready to sign and/or verify. `kid` is a stable fingerprint of the public
/// key (not the key material itself) so it's safe to put in a JWT header and log.
pub struct EcKeyPair {
    pub kid: String,
    pub encoding: EncodingKey,
    pub decoding: DecodingKey,
}

impl EcKeyPair {
    /// Parses a PEM-encoded EC private key (PKCS8 or SEC1) from signet secret bytes and builds
    /// both halves of the keypair.
    pub fn from_pem_bytes(pem_bytes: &[u8]) -> Result<Self, KeyError> {
        let pem = std::str::from_utf8(pem_bytes).map_err(|_| KeyError::NotUtf8)?;
        let secret_key = parse_secret_key(pem)?;

        let public_key = secret_key.public_key();
        let kid = fingerprint(&public_key);

        let private_pkcs8 = secret_key
            .to_pkcs8_pem(LineEnding::LF)
            .map_err(|e| KeyError::EncodePrivate(e.to_string()))?;
        let public_spki = public_key
            .to_public_key_pem(LineEnding::LF)
            .map_err(|e| KeyError::EncodePublic(e.to_string()))?;

        let encoding = EncodingKey::from_ec_pem(private_pkcs8.as_bytes())?;
        let decoding = DecodingKey::from_ec_pem(public_spki.as_bytes())?;

        Ok(Self {
            kid,
            encoding,
            decoding,
        })
    }
}

fn parse_secret_key(pem: &str) -> Result<SecretKey, KeyError> {
    // Try PKCS8 first (the more common modern shape), then SEC1 ("EC PRIVATE KEY").
    if let Ok(key) = SecretKey::from_pkcs8_pem(pem) {
        return Ok(key);
    }
    match sec1_parse(pem) {
        Ok(key) => Ok(key),
        Err(e) => Err(KeyError::Parse(e)),
    }
}

fn sec1_parse(pem: &str) -> Result<SecretKey, String> {
    SecretKey::from_sec1_pem(pem).map_err(|e| e.to_string())
}

fn fingerprint(public_key: &p256::PublicKey) -> String {
    let encoded_point = public_key.to_encoded_point(true); // compressed SEC1 bytes
    let digest = Sha256::digest(encoded_point.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&digest[..16])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::generate_pkcs8_pem as generate_test_pkcs8_pem;

    #[test]
    fn parses_pkcs8_pem_and_signs_verifies() {
        let pem = generate_test_pkcs8_pem();
        let pair = EcKeyPair::from_pem_bytes(pem.as_bytes()).expect("parse");
        assert!(!pair.kid.is_empty());

        let claims = serde_json::json!({"sub": "test@example.com", "iat": 0, "exp": 9999999999u64});
        let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES256);
        let token = jsonwebtoken::encode(&header, &claims, &pair.encoding).unwrap();

        let validation = {
            let mut v = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::ES256);
            v.validate_aud = false;
            v
        };
        let decoded =
            jsonwebtoken::decode::<serde_json::Value>(&token, &pair.decoding, &validation).unwrap();
        assert_eq!(decoded.claims["sub"], "test@example.com");
    }

    #[test]
    fn same_key_produces_same_kid() {
        let pem = generate_test_pkcs8_pem();
        let pair1 = EcKeyPair::from_pem_bytes(pem.as_bytes()).unwrap();
        let pair2 = EcKeyPair::from_pem_bytes(pem.as_bytes()).unwrap();
        assert_eq!(pair1.kid, pair2.kid);
    }

    #[test]
    fn different_keys_produce_different_kids() {
        let pair1 = EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap();
        let pair2 = EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap();
        assert_ne!(pair1.kid, pair2.kid);
    }
}
