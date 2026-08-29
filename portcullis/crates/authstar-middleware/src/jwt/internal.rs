//! Internal JWT (the 60-second, upstream-facing `Authorization: Bearer` token) — Story 010.
//! Only ever minted by portcullis, never verified by portcullis itself (downstream services
//! verify it independently against the tenant's public key, per ADR 0030's "defense in depth" —
//! out of scope for this crate).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{crypto, Algorithm};
use serde::{Deserialize, Serialize};

use crate::keys::EcKeyPair;

pub const INTERNAL_TOKEN_TTL_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(rename = "accountId", skip_serializing_if = "Option::is_none", default)]
    pub account_id: Option<String>,
    /// The account's organization memberships (ADR 0100) -- an account can belong to more than
    /// one organization, each conferring its own independent role list. Same never-fabricated
    /// treatment as `account_id`: empty on a degraded token, never guessed.
    #[serde(rename = "organizationMemberships", skip_serializing_if = "Vec::is_empty", default)]
    pub organization_memberships: Vec<OrganizationMembership>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub roles: Vec<String>,
    /// Tenant-wide, unfiltered permissions (ADR 0018/0030) — the closed, authstar-owned
    /// vocabulary tower's own authorization is built on, permanently distinct from the
    /// open, app-owned `roles` vocabulary above (ADR 0069). Always present; empty when
    /// `enrichmentStatus` is "degraded", same as `roles`.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub usage: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isNewAccount", default)]
    pub is_new_account: Option<bool>,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnrichmentStatus {
    Ok,
    Degraded,
}

/// One organization the account belongs to, and the role list it holds within it (ADR 0100).
/// `roles` is the same open, catalog-validated vocabulary app-scoped roles already use --
/// portcullis never interprets it, just forwards it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OrganizationMembership {
    #[serde(rename = "organizationId")]
    pub organization_id: String,
    #[serde(default)]
    pub roles: Vec<String>,
}

pub struct BaselineIdentity<'a> {
    pub email: &'a str,
    pub idp: &'a str,
    pub identity_hash: &'a str,
}

/// Builds the claims for an `Allow` outcome: baseline identity plus
/// accountId/roles/permissions/usage.
pub fn allow_claims(
    identity: BaselineIdentity,
    account_id: String,
    organization_memberships: Vec<OrganizationMembership>,
    roles: Vec<String>,
    permissions: Vec<String>,
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
        organization_memberships,
        roles,
        permissions,
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
        organization_memberships: Vec::new(),
        roles: Vec::new(),
        permissions: Vec::new(),
        usage: None,
        is_new_account: None,
        iat: now,
        exp: now + INTERNAL_TOKEN_TTL_SECS,
    }
}

/// The internal JWT's protected header — `alg`/`typ`/`kid` plus `tenant` (ADR 0089): the tenant
/// slug portcullis already resolved from `Host` before minting this token, carried as an
/// unverified hint downstream services use only to select which tenant's JWKS to attempt
/// verification against (the same principle `kid`-based key selection already relies on — see
/// the ADR for the full justification). `jsonwebtoken::Header` has no extension point for a
/// custom field, so this hand-rolls the header/signature the same way `jsonwebtoken::encode`
/// does internally, using its public `crypto::sign`.
#[derive(Serialize)]
struct InternalHeader<'a> {
    typ: &'static str,
    alg: Algorithm,
    kid: &'a str,
    tenant: &'a str,
}

pub fn sign_internal(
    key: &EcKeyPair,
    claims: &InternalClaims,
    tenant: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let header = InternalHeader {
        typ: "JWT",
        alg: Algorithm::ES256,
        kid: &key.kid,
        tenant,
    };
    let encoded_header = b64_encode_json(&header)?;
    let encoded_claims = b64_encode_json(claims)?;
    let message = [encoded_header, encoded_claims].join(".");
    let signature = crypto::sign(message.as_bytes(), &key.encoding, Algorithm::ES256)?;
    Ok([message, signature].join("."))
}

fn b64_encode_json<T: Serialize>(value: &T) -> Result<String, jsonwebtoken::errors::Error> {
    let json = serde_json::to_vec(value).map_err(jsonwebtoken::errors::Error::from)?;
    Ok(URL_SAFE_NO_PAD.encode(json))
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

    fn identity() -> BaselineIdentity<'static> {
        BaselineIdentity {
            email: "admin@example.com",
            idp: "dex",
            identity_hash: "abc123",
        }
    }

    #[test]
    fn allow_claims_carries_permissions_through() {
        let claims = allow_claims(
            identity(),
            "acct-1".to_string(),
            vec![],
            vec!["member".to_string()],
            vec!["tenant:manage".to_string()],
            serde_json::Value::Null,
            false,
        );
        assert_eq!(claims.permissions, vec!["tenant:manage".to_string()]);
    }

    #[test]
    fn allow_claims_carries_organization_memberships_through_when_present() {
        let claims = allow_claims(
            identity(),
            "acct-1".to_string(),
            vec![
                OrganizationMembership {
                    organization_id: "org-1".to_string(),
                    roles: vec!["manager".to_string(), "member".to_string()],
                },
                OrganizationMembership {
                    organization_id: "org-2".to_string(),
                    roles: vec!["member".to_string()],
                },
            ],
            vec![],
            vec![],
            serde_json::Value::Null,
            false,
        );
        assert_eq!(
            claims.organization_memberships,
            vec![
                OrganizationMembership {
                    organization_id: "org-1".to_string(),
                    roles: vec!["manager".to_string(), "member".to_string()],
                },
                OrganizationMembership {
                    organization_id: "org-2".to_string(),
                    roles: vec!["member".to_string()],
                },
            ]
        );
    }

    #[test]
    fn degraded_claims_never_fabricates_organization_memberships() {
        let claims = degraded_claims(identity());
        assert!(claims.organization_memberships.is_empty());
    }

    #[test]
    fn degraded_claims_never_fabricates_permissions() {
        let claims = degraded_claims(identity());
        assert!(claims.permissions.is_empty());
    }

    #[test]
    fn sign_internal_carries_tenant_on_the_header_not_the_payload() {
        let key = crate::test_support::generate_keypair();
        let claims = degraded_claims(identity());
        let token = sign_internal(&key, &claims, "acme").expect("sign");

        let header_b64 = token.split('.').next().unwrap();
        let header_json = URL_SAFE_NO_PAD.decode(header_b64).unwrap();
        let header: serde_json::Value = serde_json::from_slice(&header_json).unwrap();
        assert_eq!(header["tenant"], "acme");
        assert_eq!(header["kid"], key.kid);
        assert_eq!(header["alg"], "ES256");

        let payload_b64 = token.split('.').nth(1).unwrap();
        let payload_json = URL_SAFE_NO_PAD.decode(payload_b64).unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&payload_json).unwrap();
        assert!(payload.get("tenant").is_none());
    }

    #[test]
    fn sign_internal_produces_a_signature_the_holder_key_verifies() {
        let key = crate::test_support::generate_keypair();
        let claims = degraded_claims(identity());
        let token = sign_internal(&key, &claims, "acme").expect("sign");

        let mut validation = jsonwebtoken::Validation::new(Algorithm::ES256);
        validation.validate_exp = false;
        validation.required_spec_claims.clear();
        let decoded = jsonwebtoken::decode::<InternalClaims>(&token, &key.decoding, &validation)
            .expect("verify");
        assert_eq!(decoded.claims.sub, "admin@example.com");
    }
}
