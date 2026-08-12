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
    /// SPKI-encoded (X.509 `SubjectPublicKeyInfo`) PEM text for the public half — computed once
    /// here, not re-derived per JWKS request. Served alongside `x`/`y` on the JWKS response
    /// (ADR 0087) for client libraries whose native crypto API takes PEM/DER input rather than
    /// a JWK's raw EC point.
    pub public_key_pem: String,
    /// Base64url (no padding), unpadded big-endian coordinates of the public EC point — the
    /// `x`/`y` a JWK needs. Computed once here from the same `p256::PublicKey` `kid` and
    /// `public_key_pem` are derived from, not re-derived per JWKS request.
    pub jwk_x: String,
    pub jwk_y: String,
}

impl EcKeyPair {
    /// Parses a PEM-encoded EC private key (PKCS8 or SEC1) from signet secret bytes and builds
    /// both halves of the keypair.
    pub fn from_pem_bytes(pem_bytes: &[u8]) -> Result<Self, KeyError> {
        let pem = std::str::from_utf8(pem_bytes).map_err(|_| KeyError::NotUtf8)?;
        let secret_key = parse_secret_key(pem)?;

        let public_key = secret_key.public_key();
        let kid = fingerprint(&public_key);
        let (jwk_x, jwk_y) = jwk_point(&public_key);

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
            public_key_pem: public_spki,
            jwk_x,
            jwk_y,
        })
    }

    /// This key's public half as a JWKS entry (ADR 0086/0087) — `permissions`-free, safe to
    /// serve unauthenticated.
    pub fn to_jwk(&self) -> Jwk {
        Jwk {
            kty: "EC",
            crv: "P-256",
            kid: self.kid.clone(),
            usage: "sig",
            alg: "ES256",
            x: self.jwk_x.clone(),
            y: self.jwk_y.clone(),
            public_key_pem: self.public_key_pem.clone(),
        }
    }
}

/// One tenant's ordered set of session/internal key generations, current first (ADR 0088) —
/// the shape `gate.rs` needs to verify against every in-window key and `jwks_handler` needs to
/// publish every in-window internal key. Mirrors `identity_hash::IdentityHashKeys`'s shape,
/// applied to `EcKeyPair` instead of raw HMAC key bytes.
pub struct EcKeyGenerations {
    /// `(version, key)`, ordered current-generation first (highest version first).
    generations: Vec<(u32, std::sync::Arc<EcKeyPair>)>,
}

impl EcKeyGenerations {
    pub fn new(mut generations: Vec<(u32, std::sync::Arc<EcKeyPair>)>) -> Self {
        generations.sort_by_key(|(version, _)| std::cmp::Reverse(*version));
        Self { generations }
    }

    pub fn is_empty(&self) -> bool {
        self.generations.is_empty()
    }

    /// The current (highest-version) generation's key, if any — the only one ever used for
    /// *signing* (a fresh session cookie or internal token always signs under the newest key).
    pub fn current(&self) -> Option<&std::sync::Arc<EcKeyPair>> {
        self.generations.first().map(|(_, k)| k)
    }

    /// Every generation's key, current first — used for *verifying* a session JWT (any in-window
    /// key must still validate a cookie signed under it) and for serving every in-window
    /// internal-key generation on the JWKS endpoint.
    pub fn all(&self) -> impl Iterator<Item = &std::sync::Arc<EcKeyPair>> {
        self.generations.iter().map(|(_, k)| k)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Jwk {
    pub kty: &'static str,
    pub crv: &'static str,
    pub kid: String,
    #[serde(rename = "use")]
    pub usage: &'static str,
    pub alg: &'static str,
    pub x: String,
    pub y: String,
    #[serde(rename = "publicKeyPem")]
    pub public_key_pem: String,
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

/// The uncompressed EC point's `x`/`y` coordinates, base64url (no padding) — exactly what a
/// JWK's own `x`/`y` members expect (RFC 7518 §6.2.1.2/6.2.1.3).
fn jwk_point(public_key: &p256::PublicKey) -> (String, String) {
    let encoded_point = public_key.to_encoded_point(false); // uncompressed: 0x04 || X || Y
    let x = encoded_point.x().expect("uncompressed point always has x");
    let y = encoded_point.y().expect("uncompressed point always has y");
    (
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(x),
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(y),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::generate_pkcs8_pem as generate_test_pkcs8_pem;
    use p256::elliptic_curve::sec1::FromEncodedPoint;

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

    #[test]
    fn jwk_x_y_are_valid_p256_coordinates_for_the_same_key() {
        let pair = EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap();
        let jwk = pair.to_jwk();

        let x = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&jwk.x)
            .unwrap();
        let y = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&jwk.y)
            .unwrap();
        assert_eq!(x.len(), 32, "P-256 field elements are 32 bytes");
        assert_eq!(y.len(), 32, "P-256 field elements are 32 bytes");

        // Reconstructing a public key from x/y alone must fingerprint identically to the
        // original -- proof the JWK's point actually represents the same key `kid` was
        // computed from, not just correctly-shaped bytes.
        let encoded_point = p256::EncodedPoint::from_affine_coordinates(
            x.as_slice().into(),
            y.as_slice().into(),
            false,
        );
        let reconstructed = p256::PublicKey::from_encoded_point(&encoded_point).unwrap();
        assert_eq!(fingerprint(&reconstructed), jwk.kid);
        assert_eq!(jwk.kid, pair.kid);
    }

    #[test]
    fn to_jwk_public_key_pem_verifies_tokens_signed_by_this_pair() {
        let pair = EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap();
        let jwk = pair.to_jwk();

        let claims = serde_json::json!({"sub": "test@example.com", "iat": 0, "exp": 9999999999u64});
        let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES256);
        let token = jsonwebtoken::encode(&header, &claims, &pair.encoding).unwrap();

        let decoding_key_from_pem =
            DecodingKey::from_ec_pem(jwk.public_key_pem.as_bytes()).unwrap();
        let validation = {
            let mut v = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::ES256);
            v.validate_aud = false;
            v
        };
        let decoded =
            jsonwebtoken::decode::<serde_json::Value>(&token, &decoding_key_from_pem, &validation)
                .unwrap();
        assert_eq!(decoded.claims["sub"], "test@example.com");
    }

    #[test]
    fn to_jwk_has_expected_static_fields() {
        let pair = EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap();
        let jwk = pair.to_jwk();
        assert_eq!(jwk.kty, "EC");
        assert_eq!(jwk.crv, "P-256");
        assert_eq!(jwk.usage, "sig");
        assert_eq!(jwk.alg, "ES256");
    }

    fn keypair() -> std::sync::Arc<EcKeyPair> {
        std::sync::Arc::new(
            EcKeyPair::from_pem_bytes(generate_test_pkcs8_pem().as_bytes()).unwrap(),
        )
    }

    #[test]
    fn ec_key_generations_current_is_the_highest_version_regardless_of_insertion_order() {
        let (v1, v2, v3) = (keypair(), keypair(), keypair());
        let generations =
            EcKeyGenerations::new(vec![(2, v2.clone()), (1, v1.clone()), (3, v3.clone())]);
        assert_eq!(generations.current().unwrap().kid, v3.kid);
    }

    #[test]
    fn ec_key_generations_all_returns_every_generation_current_first() {
        let (v1, v2) = (keypair(), keypair());
        let generations = EcKeyGenerations::new(vec![(1, v1.clone()), (2, v2.clone())]);
        let kids: Vec<&str> = generations.all().map(|k| k.kid.as_str()).collect();
        assert_eq!(kids, vec![v2.kid.as_str(), v1.kid.as_str()]);
    }

    #[test]
    fn ec_key_generations_empty_has_no_current() {
        let generations = EcKeyGenerations::new(Vec::new());
        assert!(generations.is_empty());
        assert!(generations.current().is_none());
        assert_eq!(generations.all().count(), 0);
    }
}
