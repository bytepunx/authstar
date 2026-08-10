//! Claims enrichment (Story 010/013/015): after a session JWT verifies, portcullis calls
//! tower's `POST /enrich` to find out what the caller is allowed to do, then folds the result
//! into the 60-second internal JWT it mints for the upstream request.
//!
//! **Wire contract judgment call**: Stories 010/013/015 describe the three *outcomes*
//! (`Allow`/`Deny`/`Unreachable`) and their fields precisely, but not tower's exact HTTP
//! status/body shape for each — that level of detail lives in an ADR this pass didn't have
//! available while this module was written (see `TESTING.md`). The contract implemented here,
//! clearly isolated in `parse_enrich_response`, is: `200 OK` -> `Allow` (JSON body below); any
//! other HTTP status tower actually answers with -> `Deny{status: &lt;that status&gt;, reason}`
//! (reason from a best-effort `reason`/`error` JSON field, falling back to a generic message);
//! connection failure/timeout -> `Unreachable`. This keeps the three Story-mandated outcomes
//! exactly separated even though the precise byte-for-byte wire shape may need adjusting once
//! tower's own `/enrich` implementation (or its ADR) is available to check against.

use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const ENRICH_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct EnrichmentContext {
    pub tenant: String,
    pub application: String,
    pub idp: String,
    pub identity_hash: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize)]
struct EnrichRequestBody<'a> {
    tenant: &'a str,
    idp: &'a str,
    #[serde(rename = "identityHash")]
    identity_hash: &'a str,
    email: &'a str,
    application: &'a str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowOutcome {
    pub account_id: String,
    #[serde(default)]
    pub granted_roles: Vec<String>,
    #[serde(default)]
    pub trial_roles: Vec<String>,
    /// Unix timestamp (seconds); `None` means "no trial in effect."
    #[serde(default)]
    pub trial_expires_at: Option<i64>,
    /// Passed through unchanged onto the internal token per Story 010/ADR 0043 — portcullis
    /// never interprets this beyond forwarding it.
    #[serde(default)]
    pub usage: serde_json::Value,
    #[serde(default)]
    pub is_new_account: bool,
}

impl AllowOutcome {
    /// `roles = grantedRoles + (trialRoles if now < trialExpiresAt else [])` — Story 010/ADR
    /// 0018: this merge and the trial-expiry comparison are portcullis's own job, evaluated
    /// against a local clock, never re-checked against tower.
    pub fn merged_roles(&self, now_unix: i64) -> Vec<String> {
        let mut roles = self.granted_roles.clone();
        if let Some(expires_at) = self.trial_expires_at {
            if now_unix < expires_at {
                for role in &self.trial_roles {
                    if !roles.contains(role) {
                        roles.push(role.clone());
                    }
                }
            }
        }
        roles
    }
}

#[derive(Debug, Clone)]
pub enum EnrichmentOutcome {
    Allow(AllowOutcome),
    Deny { status: u16, reason: String },
    Unreachable(String),
}

#[async_trait]
pub trait ClaimsEnricher: Send + Sync {
    async fn enrich(&self, ctx: &EnrichmentContext) -> EnrichmentOutcome;
}

/// Never allows, never denies with detail — a safe placeholder for tests/tools that don't need
/// a real tower. Not used in production wiring.
pub struct UnreachableEnricher;

#[async_trait]
impl ClaimsEnricher for UnreachableEnricher {
    async fn enrich(&self, _ctx: &EnrichmentContext) -> EnrichmentOutcome {
        EnrichmentOutcome::Unreachable("no enricher configured".to_string())
    }
}

pub struct TowerClaimsEnricher {
    client: reqwest::Client,
    /// Base URL for tower, reached over SPIFFE mTLS in production (the `reqwest::Client` passed
    /// in is expected to already be configured for that — this struct has no SPIFFE knowledge
    /// of its own).
    base_url: String,
}

impl TowerClaimsEnricher {
    pub fn new(client: reqwest::Client, base_url: impl Into<String>) -> Self {
        Self {
            client,
            base_url: base_url.into(),
        }
    }
}

#[async_trait]
impl ClaimsEnricher for TowerClaimsEnricher {
    async fn enrich(&self, ctx: &EnrichmentContext) -> EnrichmentOutcome {
        let url = format!("{}/enrich", self.base_url.trim_end_matches('/'));
        let body = EnrichRequestBody {
            tenant: &ctx.tenant,
            idp: &ctx.idp,
            identity_hash: &ctx.identity_hash,
            email: &ctx.email,
            application: &ctx.application,
        };

        let response = match self
            .client
            .post(&url)
            .json(&body)
            .timeout(ENRICH_TIMEOUT)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return EnrichmentOutcome::Unreachable(e.to_string()),
        };

        parse_enrich_response(
            response.status().as_u16(),
            response.text().await.unwrap_or_default(),
        )
    }
}

fn parse_enrich_response(status: u16, body: String) -> EnrichmentOutcome {
    if status == 200 {
        match serde_json::from_str::<AllowOutcome>(&body) {
            Ok(allow) => EnrichmentOutcome::Allow(allow),
            Err(e) => EnrichmentOutcome::Unreachable(format!("malformed enrich response: {e}")),
        }
    } else {
        #[derive(Deserialize)]
        struct DenyBody {
            #[serde(default)]
            reason: Option<String>,
            #[serde(default)]
            error: Option<String>,
        }
        let reason = serde_json::from_str::<DenyBody>(&body)
            .ok()
            .and_then(|b| b.reason.or(b.error))
            .unwrap_or_else(|| format!("tower denied with status {status}"));
        EnrichmentOutcome::Deny { status, reason }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_allow_response() {
        let body = serde_json::json!({
            "accountId": "acct-1",
            "grantedRoles": ["member"],
            "trialRoles": ["premium"],
            "trialExpiresAt": 2000000000i64,
            "usage": {"apiCalls": {"used": 10, "limit": 100}},
        })
        .to_string();
        let outcome = parse_enrich_response(200, body);
        match outcome {
            EnrichmentOutcome::Allow(allow) => {
                assert_eq!(allow.account_id, "acct-1");
                assert_eq!(allow.granted_roles, vec!["member"]);
                let roles = allow.merged_roles(0);
                assert!(roles.contains(&"member".to_string()));
                assert!(roles.contains(&"premium".to_string()));
                let expired_roles = allow.merged_roles(3000000000);
                assert!(!expired_roles.contains(&"premium".to_string()));
            }
            other => panic!("expected Allow, got {other:?}"),
        }
    }

    #[test]
    fn parses_deny_response() {
        let body = serde_json::json!({"reason": "no active subscription"}).to_string();
        let outcome = parse_enrich_response(403, body);
        match outcome {
            EnrichmentOutcome::Deny { status, reason } => {
                assert_eq!(status, 403);
                assert_eq!(reason, "no active subscription");
            }
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn malformed_allow_body_is_treated_as_unreachable() {
        let outcome = parse_enrich_response(200, "not json".to_string());
        assert!(matches!(outcome, EnrichmentOutcome::Unreachable(_)));
    }
}
