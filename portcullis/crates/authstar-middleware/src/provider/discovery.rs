//! OIDC provider discovery (Story 004). Runs once at startup, concurrently across every
//! tenant/provider pair; a failure for one tenant's one provider never affects any other
//! tenant/provider or startup as a whole (per-tenant/provider failure isolation, a deliberate
//! departure from ref-design's fail-the-whole-process behavior).

use std::time::Duration;

use authstar_config::bundle::ProviderConfig;
use serde::Deserialize;

const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    pub client_id: String,
    pub scope: Vec<String>,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub userinfo_endpoint: String,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum DiscoveryError {
    #[error("discovery request failed: {0}")]
    Request(String),
    #[error("discovery endpoint returned HTTP {0}")]
    HttpStatus(u16),
    #[error("discovery document missing required field {0}")]
    MissingField(&'static str),
}

#[derive(Deserialize)]
struct DiscoveryDocument {
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: Option<String>,
}

fn discovery_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/.well-known/openid-configuration") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/.well-known/openid-configuration")
    }
}

pub async fn discover_one(
    client: &reqwest::Client,
    provider: &ProviderConfig,
) -> Result<ResolvedProvider, DiscoveryError> {
    let url = discovery_url(&provider.discovery_url);
    let response = client
        .get(&url)
        .timeout(DISCOVERY_TIMEOUT)
        .send()
        .await
        .map_err(|e| DiscoveryError::Request(e.to_string()))?;

    if !response.status().is_success() {
        return Err(DiscoveryError::HttpStatus(response.status().as_u16()));
    }

    let doc: DiscoveryDocument = response
        .json()
        .await
        .map_err(|e| DiscoveryError::Request(e.to_string()))?;

    let userinfo_endpoint = doc
        .userinfo_endpoint
        .ok_or(DiscoveryError::MissingField("userinfo_endpoint"))?;

    Ok(ResolvedProvider {
        client_id: provider.client_id.clone(),
        scope: provider.scope.clone(),
        authorization_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        userinfo_endpoint,
    })
}

/// One entry in the flat list of every tenant/provider pair discovery is run for.
pub struct DiscoveryTarget<'a> {
    pub tenant_slug: &'a str,
    pub provider_name: &'a str,
    pub provider: &'a ProviderConfig,
}

pub struct DiscoveryOutcome {
    pub tenant_slug: String,
    pub provider_name: String,
    pub result: Result<ResolvedProvider, DiscoveryError>,
}

/// Runs discovery for every given target concurrently; startup time is bounded by the slowest
/// single fetch, not the sum. Never fails as a whole — every outcome (success or per-target
/// error) is returned for the caller to fold into per-tenant provider maps.
pub async fn discover_all(
    client: &reqwest::Client,
    targets: Vec<DiscoveryTarget<'_>>,
) -> Vec<DiscoveryOutcome> {
    let futures = targets.into_iter().map(|target| {
        let tenant_slug = target.tenant_slug.to_string();
        let provider_name = target.provider_name.to_string();
        async move {
            let result = discover_one(client, target.provider).await;
            DiscoveryOutcome {
                tenant_slug,
                provider_name,
                result,
            }
        }
    });
    futures::future::join_all(futures).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_url_appends_well_known_path() {
        assert_eq!(
            discovery_url("https://idp.example.com"),
            "https://idp.example.com/.well-known/openid-configuration"
        );
    }

    #[test]
    fn discovery_url_trims_trailing_slash() {
        assert_eq!(
            discovery_url("https://idp.example.com/"),
            "https://idp.example.com/.well-known/openid-configuration"
        );
    }

    #[test]
    fn discovery_url_leaves_explicit_path_alone() {
        assert_eq!(
            discovery_url("https://idp.example.com/.well-known/openid-configuration"),
            "https://idp.example.com/.well-known/openid-configuration"
        );
    }
}
