//! API-key verification (design/adrs/0101-api-keys.md) -- portcullis's second
//! credential-verification path alongside `enricher.rs`'s session-cookie one. Calls tower's
//! `POST /verify-api-key` on every request bearing an `Authorization: Bearer
//! authstar_{apiKeyId}_{secret}` credential (`api_key.rs`).
//!
//! **Deliberately does NOT reuse `enricher::{EnrichmentOutcome, AllowOutcome}` verbatim**, despite
//! this module's own structure closely mirroring `enricher.rs`'s (`ApiKeyVerifier` trait,
//! `Allow`/`Deny`/`Unreachable` outcome, `Tower*` HTTP implementation, `parse_*_response` free
//! function). The identity model genuinely differs: a session's `sub`/`idp`/`identityHash` come
//! from the *already locally-verified* session JWT itself (`gate.rs`'s `BaselineIdentity`, built
//! before `/enrich` is ever called) -- `/enrich`'s own response never carries identity at all. An
//! API key has no such locally-verifiable credential (verification is 100% tower-side, by design
//! -- see the ADR), so `/verify-api-key`'s response has to supply identity itself (`sub`, and for
//! an org-owned key, no `accountId` at all -- a case `AllowOutcome.account_id: String`'s
//! non-optional shape has no way to represent). Reusing one type for both would either force a
//! breaking change onto every existing `/enrich` caller (`account_id` becoming optional) or paper
//! over a genuine semantic difference. A parallel, purpose-built type is more honest.
//!
//! **Does NOT fail open on `Unreachable`**, unlike the session path's ADR-0015 posture (see
//! `gate.rs`'s `handle_api_key_outcome`). A session's identity is already cryptographically
//! verified locally before enrichment even runs -- `/enrich` only supplies *entitlement* data, so
//! failing open there means "authenticated, but with zero roles," a safe default. An API key's
//! `apiKeyId`/`secret` pair is **not self-verifying at all** -- nothing about it is checked
//! without tower. Failing open here would mean forwarding a request bearing an entirely
//! unverified, possibly fabricated credential as if it were a real (if degraded) authenticated
//! caller. Denying outright when tower is unreachable is the only posture that doesn't let a
//! tower outage turn into "any string shaped like `authstar_x_y` gets through."

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const VERIFY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct ApiKeyVerificationContext {
    pub tenant: String,
    pub application: String,
    pub api_key_id: String,
    pub secret: String,
}

/// Mirrors tower's `POST /verify-api-key` JSON response shape exactly (`tower/src/routes/
/// verify-api-key.ts`) -- `permissions`/`trialRoles` are always empty and `trialExpiresAt` is
/// always `null` on the wire (API keys never carry tower's own closed permission catalog and
/// don't participate in trials), so they're parsed-and-discarded here rather than modeled.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyAllowOutcome {
    pub api_key_id: String,
    pub sub: String,
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default)]
    pub granted_roles: Vec<String>,
    #[serde(default)]
    pub rate_limit: Option<ApiKeyRateLimit>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyRateLimit {
    pub requests_per_minute: u32,
    #[serde(default)]
    pub burst: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum ApiKeyVerificationOutcome {
    Allow(ApiKeyAllowOutcome),
    Deny { status: u16, reason: String },
    Unreachable(String),
}

#[async_trait]
pub trait ApiKeyVerifier: Send + Sync {
    async fn verify(&self, ctx: &ApiKeyVerificationContext) -> ApiKeyVerificationOutcome;
}

/// Never allows -- a safe placeholder for tests/tools that don't need a real tower. Not used in
/// production wiring.
pub struct UnreachableApiKeyVerifier;

#[async_trait]
impl ApiKeyVerifier for UnreachableApiKeyVerifier {
    async fn verify(&self, _ctx: &ApiKeyVerificationContext) -> ApiKeyVerificationOutcome {
        ApiKeyVerificationOutcome::Unreachable("no api key verifier configured".to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
struct VerifyRequestBody<'a> {
    tenant: &'a str,
    application: &'a str,
    #[serde(rename = "apiKeyId")]
    api_key_id: &'a str,
    secret: &'a str,
}

pub struct TowerApiKeyVerifier {
    client: reqwest::Client,
    /// Same client/base-URL convention as `TowerClaimsEnricher` -- SPIFFE mTLS in production, the
    /// caller is expected to have already configured it.
    base_url: String,
}

impl TowerApiKeyVerifier {
    pub fn new(client: reqwest::Client, base_url: impl Into<String>) -> Self {
        Self {
            client,
            base_url: base_url.into(),
        }
    }
}

#[async_trait]
impl ApiKeyVerifier for TowerApiKeyVerifier {
    async fn verify(&self, ctx: &ApiKeyVerificationContext) -> ApiKeyVerificationOutcome {
        let url = format!("{}/verify-api-key", self.base_url.trim_end_matches('/'));
        let body = VerifyRequestBody {
            tenant: &ctx.tenant,
            application: &ctx.application,
            api_key_id: &ctx.api_key_id,
            secret: &ctx.secret,
        };

        let response = match self
            .client
            .post(&url)
            .json(&body)
            .timeout(VERIFY_TIMEOUT)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return ApiKeyVerificationOutcome::Unreachable(e.to_string()),
        };

        parse_verify_response(
            response.status().as_u16(),
            response.text().await.unwrap_or_default(),
        )
    }
}

fn parse_verify_response(status: u16, body: String) -> ApiKeyVerificationOutcome {
    if status == 200 {
        match serde_json::from_str::<ApiKeyAllowOutcome>(&body) {
            Ok(allow) => ApiKeyVerificationOutcome::Allow(allow),
            Err(e) => {
                ApiKeyVerificationOutcome::Unreachable(format!("malformed verify-api-key response: {e}"))
            }
        }
    } else {
        #[derive(Deserialize)]
        struct DenyBody {
            #[serde(default)]
            error: Option<String>,
        }
        let reason = serde_json::from_str::<DenyBody>(&body)
            .ok()
            .and_then(|b| b.error)
            .unwrap_or_else(|| format!("tower denied with status {status}"));
        ApiKeyVerificationOutcome::Deny { status, reason }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_allow_response() {
        let body = serde_json::json!({
            "outcome": "allow",
            "apiKeyId": "apikey-1",
            "sub": "admin@example.com",
            "accountId": "acct-1",
            "grantedRoles": ["read"],
            "rateLimit": {"requestsPerMinute": 60, "burst": 10},
        })
        .to_string();
        match parse_verify_response(200, body) {
            ApiKeyVerificationOutcome::Allow(allow) => {
                assert_eq!(allow.api_key_id, "apikey-1");
                assert_eq!(allow.sub, "admin@example.com");
                assert_eq!(allow.account_id, Some("acct-1".to_string()));
                assert_eq!(allow.granted_roles, vec!["read".to_string()]);
                assert_eq!(allow.rate_limit.unwrap().requests_per_minute, 60);
            }
            other => panic!("expected Allow, got {other:?}"),
        }
    }

    #[test]
    fn org_owned_key_allow_has_no_account_id() {
        let body = serde_json::json!({
            "outcome": "allow",
            "apiKeyId": "apikey-2",
            "sub": "apikey:apikey-2",
            "grantedRoles": [],
        })
        .to_string();
        match parse_verify_response(200, body) {
            ApiKeyVerificationOutcome::Allow(allow) => assert_eq!(allow.account_id, None),
            other => panic!("expected Allow, got {other:?}"),
        }
    }

    #[test]
    fn parses_deny_response() {
        let body = serde_json::json!({"error": "Forbidden"}).to_string();
        match parse_verify_response(403, body) {
            ApiKeyVerificationOutcome::Deny { status, reason } => {
                assert_eq!(status, 403);
                assert_eq!(reason, "Forbidden");
            }
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn malformed_allow_body_is_treated_as_unreachable() {
        let outcome = parse_verify_response(200, "not json".to_string());
        assert!(matches!(outcome, ApiKeyVerificationOutcome::Unreachable(_)));
    }
}
