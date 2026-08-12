//! Internal JWT (the 60-second, upstream-facing `Authorization: Bearer` token) — Story 010.
//! Only ever minted by portcullis, never verified by portcullis itself (downstream services
//! verify it independently against the tenant's public key, per ADR 0030's "defense in depth" —
//! out of scope for this crate).

use jsonwebtoken::{encode, Algorithm, Header};
use serde::Serialize;

use crate::keys::EcKeyPair;

pub const INTERNAL_TOKEN_TTL_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize)]
pub struct InternalClaims {
    /// The user's email address. Same identity as the session cookie's `sub` — present on every
    /// issued internal token, `Allow` or fail-open `degraded` alike (Story 010's "baseline
    /// identity claims"). There is no separate `email` claim on this token; `sub` *is* the
    /// email, verbatim. Downstream consumers (including client libraries) should read `sub`
    /// directly rather than expecting a dedicated `email` field on the wire.
    pub sub: String,
    pub idp: String,
    #[serde(rename = "identityHash")]
    pub identity_hash: String,
    #[serde(rename = "enrichmentStatus")]
    pub enrichment_status: EnrichmentStatus,
    #[serde(rename = "accountId", skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub roles: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isNewAccount")]
    pub is_new_account: Option<bool>,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnrichmentStatus {
    Ok,
    Degraded,
}

pub struct BaselineIdentity<'a> {
    pub email: &'a str,
    pub idp: &'a str,
    pub identity_hash: &'a str,
}

/// Builds the claims for an `Allow` outcome: baseline identity plus accountId/roles/usage.
pub fn allow_claims(
    identity: BaselineIdentity,
    account_id: String,
    roles: Vec<String>,
    usage: serde_json::Value,
    is_new_account: bool,
) -> InternalClaims {
    let now = now_unix();
    InternalClaims {
        sub: identity.email.to_string(),
        idp: identity.idp.to_string(),
        identity_hash: identity.identity_hash.to_string(),
        enrichment_status: EnrichmentStatus::Ok,
        account_id: Some(account_id),
        roles,
        usage: if usage.is_null() { None } else { Some(usage) },
        is_new_account: if is_new_account { Some(true) } else { None },
        iat: now,
        exp: now + INTERNAL_TOKEN_TTL_SECS,
    }
}

/// Builds the claims for a fail-open `Unreachable` outcome: bare identity only, no fabricated
/// role/entitlement claims.
pub fn degraded_claims(identity: BaselineIdentity) -> InternalClaims {
    let now = now_unix();
    InternalClaims {
        sub: identity.email.to_string(),
        idp: identity.idp.to_string(),
        identity_hash: identity.identity_hash.to_string(),
        enrichment_status: EnrichmentStatus::Degraded,
        account_id: None,
        roles: Vec::new(),
        usage: None,
        is_new_account: None,
        iat: now,
        exp: now + INTERNAL_TOKEN_TTL_SECS,
    }
}

pub fn sign_internal(
    key: &EcKeyPair,
    claims: &InternalClaims,
) -> Result<String, jsonwebtoken::errors::Error> {
    let mut header = Header::new(Algorithm::ES256);
    header.kid = Some(key.kid.clone());
    encode(&header, claims, &key.encoding)
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
