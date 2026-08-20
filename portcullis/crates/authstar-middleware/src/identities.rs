//! tower's identity resolution call (Story 006) — distinct from `enricher.rs`'s per-request
//! `/enrich` call: this one runs once, at login time, sending the *full* ordered candidate-hash
//! list (every still-retained identity-hash key generation, current first) so a `sub` hashed
//! under a since-rotated-out key can still be matched (ADR 0028's aliasing), and can create a
//! brand new account when nothing matches.
//!
//! Same wire-contract caveat as `enricher.rs`: the precise byte-for-byte shape below is this
//! pass's own reasonable contract, isolated here for easy adjustment once tower's real
//! `/identities/resolve` (or its ADR) is available to check against.

use std::time::Duration;

use serde::{Deserialize, Serialize};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum Redeem<'a> {
    #[serde(rename = "invite")]
    Invite { token: &'a str },
}

#[derive(Debug, Clone, Serialize)]
struct ResolveRequestBody<'a> {
    tenant: &'a str,
    idp: &'a str,
    #[serde(rename = "identityHashes")]
    identity_hashes: &'a [String],
    // ADR 0092: an invite token carried through the OAuth round trip via the
    // `authstar-pending-invite` cookie (set at login initiation, read back
    // here) -- tower's own `/identities/resolve` already applies this if
    // present; portcullis previously never sent it at all, so no invite
    // ever actually granted anything on redemption.
    #[serde(skip_serializing_if = "Option::is_none")]
    redeem: Option<Redeem<'a>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityResolution {
    pub account_id: String,
    #[serde(default)]
    pub is_new_account: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum IdentityResolveError {
    #[error("request to tower failed: {0}")]
    Request(String),
    #[error("tower returned HTTP {0}")]
    HttpStatus(u16),
    #[error("malformed response from tower: {0}")]
    Malformed(String),
}

pub async fn resolve_identity(
    client: &reqwest::Client,
    tower_base_url: &str,
    tenant: &str,
    idp: &str,
    candidate_hashes: &[String],
    invite_token: Option<&str>,
) -> Result<IdentityResolution, IdentityResolveError> {
    let url = format!(
        "{}/identities/resolve",
        tower_base_url.trim_end_matches('/')
    );
    let body = ResolveRequestBody {
        tenant,
        idp,
        identity_hashes: candidate_hashes,
        redeem: invite_token.map(|token| Redeem::Invite { token }),
    };

    let response = client
        .post(&url)
        .json(&body)
        .timeout(RESOLVE_TIMEOUT)
        .send()
        .await
        .map_err(|e| IdentityResolveError::Request(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        return Err(IdentityResolveError::HttpStatus(status.as_u16()));
    }

    response
        .json::<IdentityResolution>()
        .await
        .map_err(|e| IdentityResolveError::Malformed(e.to_string()))
}
