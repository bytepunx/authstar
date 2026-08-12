//! Session JWT (the long-lived `jwt` cookie) issuance and verification — Stories 008/009.

use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::keys::EcKeyPair;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClaims {
    /// The user's email address. There is no separate `email` claim on this token — `sub` *is*
    /// the email, verbatim, by design (see `SignSessionParams::email`). Downstream consumers
    /// (including client libraries) should read `sub` directly rather than expecting a
    /// dedicated `email` field on the wire.
    pub sub: String,
    pub idp: String,
    #[serde(rename = "identityHash")]
    pub identity_hash: String,
    pub iss: String,
    pub aud: String,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum SessionJwtError {
    #[error("no session signing key available for this tenant")]
    NoKey,
    #[error("no session key matches the token's kid")]
    UnknownKid,
    #[error(transparent)]
    Jsonwebtoken(#[from] jsonwebtoken::errors::Error),
    #[error(transparent)]
    Duration(#[from] super::DurationParseError),
}

pub struct SignSessionParams<'a> {
    pub email: &'a str,
    pub idp: &'a str,
    pub identity_hash: &'a str,
    pub issuer: &'a str,
    pub audience: &'a str,
    pub expires_in: &'a str,
}

pub fn sign_session(key: &EcKeyPair, params: SignSessionParams) -> Result<String, SessionJwtError> {
    let now = now_unix();
    let ttl = super::parse_duration(params.expires_in)?;
    let claims = SessionClaims {
        sub: params.email.to_string(),
        idp: params.idp.to_string(),
        identity_hash: params.identity_hash.to_string(),
        iss: params.issuer.to_string(),
        aud: params.audience.to_string(),
        iat: now,
        exp: now + ttl,
    };
    let mut header = Header::new(Algorithm::ES256);
    header.kid = Some(key.kid.clone());
    Ok(encode(&header, &claims, &key.encoding)?)
}

/// Verifies `token` against whichever of `keys` matches the token's `kid` header, and against
/// `issuer`/`audience`. A `kid` with no matching key is treated the same as any other
/// verification failure (Story 009: absent vs. invalid vs. expired are not distinguished by the
/// gate, all fall through to "no valid session").
pub fn verify_session(
    token: &str,
    keys: &[&EcKeyPair],
    issuer: &str,
    audience: &str,
) -> Result<SessionClaims, SessionJwtError> {
    if keys.is_empty() {
        return Err(SessionJwtError::NoKey);
    }

    let header = jsonwebtoken::decode_header(token)?;
    let key = match &header.kid {
        Some(kid) => keys
            .iter()
            .find(|k| &k.kid == kid)
            .ok_or(SessionJwtError::UnknownKid)?,
        // No kid in the header: fall back to trying every key (defensive; every key portcullis
        // itself issues always carries a kid).
        None => keys[0],
    };

    let mut validation = Validation::new(Algorithm::ES256);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[audience]);
    validation.leeway = 30;

    let decoding_key: &DecodingKey = &key.decoding;
    let data = decode::<SessionClaims>(token, decoding_key, &validation)?;
    Ok(data.claims)
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::generate_keypair as test_key;

    #[test]
    fn round_trips_valid_session() {
        let key = test_key();
        let token = sign_session(
            &key,
            SignSessionParams {
                email: "user@example.com",
                idp: "google",
                identity_hash: "hash123",
                issuer: "authstar",
                audience: "acme",
                expires_in: "168h",
            },
        )
        .unwrap();

        let claims = verify_session(&token, &[&key], "authstar", "acme").unwrap();
        assert_eq!(claims.sub, "user@example.com");
        assert_eq!(claims.idp, "google");
        assert_eq!(claims.identity_hash, "hash123");
    }

    #[test]
    fn rejects_wrong_audience() {
        let key = test_key();
        let token = sign_session(
            &key,
            SignSessionParams {
                email: "user@example.com",
                idp: "google",
                identity_hash: "hash123",
                issuer: "authstar",
                audience: "acme",
                expires_in: "168h",
            },
        )
        .unwrap();

        assert!(verify_session(&token, &[&key], "authstar", "widgetco").is_err());
    }

    #[test]
    fn rejects_unknown_kid() {
        let key = test_key();
        let other_key = test_key();
        let token = sign_session(
            &key,
            SignSessionParams {
                email: "user@example.com",
                idp: "google",
                identity_hash: "hash123",
                issuer: "authstar",
                audience: "acme",
                expires_in: "168h",
            },
        )
        .unwrap();

        assert!(matches!(
            verify_session(&token, &[&other_key], "authstar", "acme"),
            Err(SessionJwtError::UnknownKid)
        ));
    }

    #[test]
    fn verifies_against_a_previous_generation_key_during_rotation_overlap() {
        // ADR 0088: a cookie signed before rotation must still verify once the tenant's
        // current key has moved on, as long as the old key is still in the candidate list.
        let previous_key = test_key();
        let current_key = test_key();
        let token = sign_session(
            &previous_key,
            SignSessionParams {
                email: "user@example.com",
                idp: "google",
                identity_hash: "hash123",
                issuer: "authstar",
                audience: "acme",
                expires_in: "168h",
            },
        )
        .unwrap();

        // Current key listed first, matching EcKeyGenerations::all()'s current-first order --
        // verify_session must still find the match by kid, not by list position.
        let claims =
            verify_session(&token, &[&current_key, &previous_key], "authstar", "acme").unwrap();
        assert_eq!(claims.sub, "user@example.com");
    }
}
