//! Typed shape of the config bundle portcullis fetches from signet.
//!
//! Story 001 (`design/stories/proxy/001-configuration-and-secrets.md`) is the source of truth
//! for this shape. portcullis holds exactly one signet scope (`ns/authstar/sa/portcullis`) and
//! gets back one bundle covering every tenant. Secret values (session/internal signing keys,
//! identity-hash keys) live under the bundle's reserved `secrets` key and are handled separately
//! by [`crate::secrets`] — this module only covers the non-secret config keys.

use indexmap::IndexMap;
use serde::Deserialize;

/// The whole non-secret portion of the fetched bundle.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub tenants: IndexMap<String, TenantConfig>,
    /// Installation-wide address of `web`, used for proxying `/oauth2/select`,
    /// `/_authstar/upgrade`, and `/_authstar/link/confirm` (Story 023). Optional so that a
    /// bundle without it still parses (those routes simply fall back / 502, per Story 023).
    #[serde(default)]
    pub web_upstream: Option<WebUpstreamConfig>,
    /// Installation-wide address of `tower`, used for claims enrichment (`/enrich`, Story 010)
    /// and login-time identity resolution (`/identities/resolve`, Story 006).
    ///
    /// **Judgment call**: the story digest available while writing this crate documented
    /// `webUpstream` explicitly as a new top-level bundle field (Story 001) but never named an
    /// equivalent for tower, even though portcullis's whole claims-enrichment design (ADR 0001)
    /// requires knowing tower's address. Story 001 is explicit that portcullis has *no*
    /// configuration source other than the signet bundle, so this can't be a bootstrap env var
    /// either. This field follows `webUpstream`'s own precedent (an installation-wide, non-
    /// tenant-scoped address) rather than inventing a different mechanism — see TESTING.md.
    #[serde(default)]
    pub tower_upstream: Option<WebUpstreamConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebUpstreamConfig {
    pub address: String,
    #[serde(default = "default_web_upstream_timeout")]
    pub timeout: u64,
}

fn default_web_upstream_timeout() -> u64 {
    10
}

#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TenantStatus {
    #[default]
    Active,
    Suspended,
    Deleted,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantConfig {
    #[serde(default)]
    pub status: TenantStatus,
    #[serde(default)]
    pub providers: IndexMap<String, ProviderConfig>,
    pub cookie: CookieConfig,
    pub jwt: TenantJwtConfig,
    #[serde(default)]
    pub branding: Option<BrandingConfig>,
    /// Named key generations for the identity hash HMAC (ADR 0027/0028). Current generation is
    /// the one with the highest `version`. Retention window (count of generations kept) must be
    /// enough to cover `cookie.max_age` — validated at startup, see `validate.rs`.
    #[serde(default)]
    pub identity_hash_key_generations: Vec<IdentityHashKeyGeneration>,
    pub applications: IndexMap<String, ApplicationConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub client_id: String,
    pub discovery_url: String,
    #[serde(default = "default_scope")]
    pub scope: Vec<String>,
}

fn default_scope() -> Vec<String> {
    vec!["openid".to_string(), "email".to_string()]
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieConfig {
    pub domain: String,
    #[serde(default = "default_cookie_path")]
    pub path: String,
    pub max_age: u64,
    #[serde(default = "default_true")]
    pub http_only: bool,
    #[serde(default)]
    pub secure: bool,
}

fn default_cookie_path() -> String {
    "/".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantJwtConfig {
    pub issuer: String,
    pub audience: String,
    /// Duration string: `Xs`/`Xm`/`Xh`/`Xd` (e.g. `168h`).
    pub expires_in: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandingConfig {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub primary_color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityHashKeyGeneration {
    pub version: u32,
    #[serde(default)]
    pub effective_from: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationConfig {
    pub hosts: Vec<String>,
    pub server: ServerConfig,
    pub upstream: UpstreamConfig,
    #[serde(default)]
    pub cors: Option<CorsConfig>,
    #[serde(default)]
    pub exempt: Vec<String>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
    /// Which of the tenant's `providers` this application exposes, in display order. Empty
    /// means "no provider-driven login for this application" (e.g. webhook-only apps).
    #[serde(default)]
    pub providers: Vec<ExposedProvider>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub public_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamConfig {
    pub base: String,
    #[serde(default)]
    pub routes: IndexMap<String, String>,
    #[serde(default = "default_upstream_timeout")]
    pub timeout: u64,
}

fn default_upstream_timeout() -> u64 {
    30
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum CorsOrigin {
    Single(String),
    Multiple(Vec<String>),
}

impl CorsOrigin {
    pub fn matches(&self, origin: &str) -> bool {
        match self {
            CorsOrigin::Single(o) => o == origin,
            CorsOrigin::Multiple(list) => list.iter().any(|o| o == origin),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorsConfig {
    pub origin: CorsOrigin,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(default)]
    pub login_url: Option<String>,
}

/// An application's exposed-provider entry: either a bare provider name (using the default
/// `/oauth2/{name}/login` and `/oauth2/{name}/callback` paths) or a detailed override.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum ExposedProvider {
    Name(String),
    Detailed {
        name: String,
        #[serde(default)]
        login_path: Option<String>,
        #[serde(default)]
        callback_path: Option<String>,
    },
}

impl ExposedProvider {
    pub fn name(&self) -> &str {
        match self {
            ExposedProvider::Name(n) => n,
            ExposedProvider::Detailed { name, .. } => name,
        }
    }

    pub fn login_path(&self) -> String {
        match self {
            ExposedProvider::Name(n) => format!("/oauth2/{n}/login"),
            ExposedProvider::Detailed {
                name, login_path, ..
            } => login_path
                .clone()
                .unwrap_or_else(|| format!("/oauth2/{name}/login")),
        }
    }

    pub fn callback_path(&self) -> String {
        match self {
            ExposedProvider::Name(n) => format!("/oauth2/{n}/callback"),
            ExposedProvider::Detailed {
                name,
                callback_path,
                ..
            } => callback_path
                .clone()
                .unwrap_or_else(|| format!("/oauth2/{name}/callback")),
        }
    }
}
