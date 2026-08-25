//! Resolved runtime state: the signet bundle's tenants/applications, combined with parsed keys,
//! OIDC discovery results, and a precomputed host index — everything the gate and OAuth2
//! handlers need per-request, with no I/O on the request path.

use std::sync::Arc;

use authstar_config::bundle::{
    Bundle, CookieConfig, CorsConfig, KeyGeneration, ProviderConfig, TenantJwtConfig, TenantStatus,
    WebUpstreamConfig,
};
use authstar_config::secrets::{
    identity_hash_key_name, internal_key_name_for_version, provider_client_secret_name,
    session_key_name_for_version,
};
use authstar_config::RawSecrets;
use indexmap::IndexMap;

use crate::enricher::ClaimsEnricher;
use crate::identity_hash::IdentityHashKeys;
use crate::keys::{EcKeyGenerations, EcKeyPair};
use crate::provider::{discover_all, DiscoveryError, DiscoveryTarget, ResolvedProvider};

pub struct ResolvedExposedProvider {
    pub name: String,
    pub login_path: String,
    pub callback_path: String,
    /// `true` iff this tenant's discovery for this provider succeeded — Story 017/018 omit
    /// non-working providers from `/oauth2/providers` and the selection page.
    pub working: bool,
}

pub struct ApplicationRuntime {
    pub slug: String,
    pub hosts: Vec<String>,
    pub public_url: String,
    pub upstream: authstar_config::bundle::UpstreamConfig,
    pub cors: Option<CorsConfig>,
    pub exempt: Vec<String>,
    pub login_url: Option<String>,
    pub exposed_providers: Vec<ResolvedExposedProvider>,
}

impl ApplicationRuntime {
    pub fn working_providers(&self) -> impl Iterator<Item = &ResolvedExposedProvider> {
        self.exposed_providers.iter().filter(|p| p.working)
    }
}

pub struct TenantRuntime {
    pub slug: String,
    pub status: TenantStatus,
    pub cookie: CookieConfig,
    pub jwt: TenantJwtConfig,
    pub branding: Option<authstar_config::bundle::BrandingConfig>,
    /// Every in-window session-key generation (ADR 0088), current first. `.current()` signs a
    /// fresh cookie; `.all()` verifies against any of them (Story 009's overlap window).
    pub session_keys: EcKeyGenerations,
    /// Every in-window internal-key generation (ADR 0088), current first. `.current()` signs a
    /// fresh internal token; `.all()` feeds every in-window key to the JWKS endpoint
    /// (portcullis itself never verifies this token — ADR 0030 — so there's no local
    /// "verify against any of them" use here the way there is for `session_keys`).
    pub internal_keys: EcKeyGenerations,
    pub identity_hash_keys: IdentityHashKeys,
    pub providers: IndexMap<String, ProviderConfig>,
    /// Provider name -> client secret, loaded from signet secrets (see
    /// `authstar_config::secrets::provider_client_secret_name`) — never part of the plain
    /// bundle config. A provider missing its secret is dropped from `resolved_providers`
    /// entirely (see `build_state`), matching the same "unavailable for this tenant/provider
    /// only" isolation as a discovery failure.
    pub provider_client_secrets: IndexMap<String, String>,
    pub resolved_providers: IndexMap<String, Result<ResolvedProvider, DiscoveryError>>,
    pub applications: IndexMap<String, ApplicationRuntime>,
}

impl TenantRuntime {
    pub fn is_active(&self) -> bool {
        self.status == TenantStatus::Active
    }
}

pub struct PortcullisState {
    pub tenants: IndexMap<String, TenantRuntime>,
    /// Precomputed at startup: `host -> (tenant_slug, application_slug)`. Story 013 requires
    /// tenant resolution and status check to happen before application resolution is even
    /// touched; this index still gives O(1) host lookup, and the caller (the gate) is
    /// responsible for checking tenant status before using anything application-specific, which
    /// achieves the same observable ordering without a second host scan.
    pub host_index: IndexMap<String, (String, String)>,
    pub web_upstream: Option<WebUpstreamConfig>,
    /// Client for calls to 3rd-party OIDC providers only (discovery, token exchange, userinfo)
    /// — ordinary public-CA-verified TLS. Never used for tower (see `tower_http_client`): a
    /// SPIFFE mTLS-configured client has no public root store and presents a client certificate
    /// no OIDC provider expects, so the two must stay separate clients.
    pub http_client: reqwest::Client,
    /// Client for `proxy_handler`'s reverse-proxy fallback to an application's own upstream
    /// (e.g. loci-web) only. Must never follow redirects itself: `reqwest`'s default policy
    /// (follow up to 10 redirects) is correct for the OIDC/webhook calls `http_client` makes, but
    /// wrong for a reverse proxy — a 3xx from upstream (e.g. SvelteKit's `redirect(303, ...)` for
    /// a completed Stripe Checkout session) must reach the browser unchanged so *it* makes the
    /// follow-up request with a Host/SNI it resolves fresh from the redirect target. Following it
    /// here instead re-sent the follow-up request carrying `proxy_handler`'s own
    /// `Host: web.loci.svc.cluster.local` override (set for the *original* upstream) against
    /// `checkout.stripe.com`'s real IP, which Stripe's edge (Host-header-routed, multi-tenant)
    /// rejected as "Requested host does not match any Subject Alternative Names (SANs)" —
    /// reproduced directly against production, not a client-side DNS artifact as first suspected.
    pub proxy_http_client: reqwest::Client,
    pub enricher: Arc<dyn ClaimsEnricher>,
    /// Client for calls to tower directly (`/identities/resolve` at login; `/enrich` also uses
    /// this client, via `TowerClaimsEnricher`'s own `client` field, constructed from a clone of
    /// this same one) — SPIFFE mTLS in production (see `authstar_config::mtls`), presenting
    /// portcullis's own SVID and validating tower's.
    pub tower_http_client: reqwest::Client,
    /// Base URL portcullis calls tower at directly (`/identities/resolve` at login, `/enrich`
    /// via the enricher) — reached over SPIFFE mTLS in production via `tower_http_client`.
    pub tower_base_url: String,
    /// Base URL portcullis forwards Stripe webhook deliveries to (`webhooks::stripe_webhook_handler`).
    /// Reached over plain in-cluster HTTP via `http_client` -- unlike tower, keep never
    /// terminates SPIFFE mTLS itself, so the narrower `http_client` (already used for plain
    /// public-CA-verified TLS elsewhere) is the correct client here too: its TLS settings are
    /// simply inert against a plain `http://` address, and introducing a third client for this
    /// one call would add no real separation of concerns.
    pub keep_base_url: String,
}

/// Every local route (the gate's proxy fallback, and every portcullis-owned `/oauth2/*` /
/// `/_authstar/*` handler alike) needs the same "resolve host, then immediately check tenant
/// status" ordering Story 013/ADR 0062 requires. `NotFound` covers both a genuinely unknown host
/// and a `deleted` tenant (treated as if it doesn't exist — a deliberate, documented judgment
/// call, see `TenantStatus`'s own doc comment for why deleted isn't spelled out by the stories).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostResolutionError {
    NotFound,
    Suspended,
}

impl PortcullisState {
    pub fn resolve_host(&self, host: &str) -> Option<(&TenantRuntime, &ApplicationRuntime)> {
        let host = strip_port(host);
        let (tenant_slug, app_slug) = self.host_index.get(host)?;
        let tenant = self.tenants.get(tenant_slug)?;
        let application = tenant.applications.get(app_slug)?;
        Some((tenant, application))
    }

    pub fn resolve_active_host(
        &self,
        host: &str,
    ) -> Result<(&TenantRuntime, &ApplicationRuntime), HostResolutionError> {
        let (tenant, application) = self
            .resolve_host(host)
            .ok_or(HostResolutionError::NotFound)?;
        match tenant.status {
            TenantStatus::Active => Ok((tenant, application)),
            TenantStatus::Suspended => Err(HostResolutionError::Suspended),
            TenantStatus::Deleted => Err(HostResolutionError::NotFound),
        }
    }
}

fn strip_port(host: &str) -> &str {
    match host.rfind(':') {
        Some(idx) => &host[..idx],
        None => host,
    }
}

#[derive(Debug)]
pub enum StartupWarning {
    MissingSessionKey {
        tenant: String,
        version: u32,
    },
    InvalidSessionKey {
        tenant: String,
        version: u32,
        error: String,
    },
    MissingInternalKey {
        tenant: String,
        version: u32,
    },
    InvalidInternalKey {
        tenant: String,
        version: u32,
        error: String,
    },
    MissingIdentityHashKey {
        tenant: String,
        version: u32,
    },
    InvalidIdentityHashKey {
        tenant: String,
        version: u32,
    },
    ProviderDiscoveryFailed {
        tenant: String,
        provider: String,
        error: String,
    },
    MissingProviderClientSecret {
        tenant: String,
        provider: String,
    },
}

impl std::fmt::Display for StartupWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StartupWarning::MissingSessionKey { tenant, version } => {
                write!(f, "tenant {tenant:?}: missing session signing key generation {version} — login is broken for this tenant only")
            }
            StartupWarning::InvalidSessionKey {
                tenant,
                version,
                error,
            } => {
                write!(f, "tenant {tenant:?}: invalid session signing key generation {version} ({error}) — login is broken for this tenant only")
            }
            StartupWarning::MissingInternalKey { tenant, version } => {
                write!(f, "tenant {tenant:?}: missing internal signing key generation {version} — internal tokens can't be minted for this tenant")
            }
            StartupWarning::InvalidInternalKey {
                tenant,
                version,
                error,
            } => {
                write!(
                    f,
                    "tenant {tenant:?}: invalid internal signing key generation {version} ({error})"
                )
            }
            StartupWarning::MissingIdentityHashKey { tenant, version } => {
                write!(
                    f,
                    "tenant {tenant:?}: missing identity hash key generation {version}"
                )
            }
            StartupWarning::InvalidIdentityHashKey { tenant, version } => {
                write!(
                    f,
                    "tenant {tenant:?}: invalid identity hash key generation {version}"
                )
            }
            StartupWarning::ProviderDiscoveryFailed {
                tenant,
                provider,
                error,
            } => {
                write!(f, "tenant {tenant:?} provider {provider:?}: discovery failed ({error}) — login via this provider is unavailable for this tenant only")
            }
            StartupWarning::MissingProviderClientSecret { tenant, provider } => {
                write!(f, "tenant {tenant:?} provider {provider:?}: missing OAuth2 client secret — login via this provider is unavailable for this tenant only")
            }
        }
    }
}

/// Builds the full runtime state from a fetched bundle: parses keys, runs OIDC discovery for
/// every tenant/provider concurrently, resolves each application's default login URL and
/// exposed-provider list, and builds the host index. Never fails as a whole for a single
/// tenant/provider's problem (Story 004's per-tenant isolation) — every issue is folded into
/// the returned warning list for the caller to log, and that tenant/provider is simply degraded
/// (missing keys => that tenant's auth-touching routes will error; failed discovery => that
/// provider omitted from listings and its login path 404s).
pub async fn build_state(
    bundle: Bundle,
    secrets: RawSecrets,
    http_client: reqwest::Client,
    proxy_http_client: reqwest::Client,
    tower_http_client: reqwest::Client,
    enricher: Arc<dyn ClaimsEnricher>,
    tower_base_url: String,
    keep_base_url: String,
) -> (PortcullisState, Vec<StartupWarning>) {
    let mut warnings = Vec::new();

    // Discovery runs once, concurrently, across every tenant/provider pair in the whole bundle.
    let mut discovery_index: IndexMap<(String, String), Result<ResolvedProvider, DiscoveryError>> =
        IndexMap::new();
    {
        let mut targets = Vec::new();
        for (tenant_slug, tenant) in &bundle.tenants {
            for (provider_name, provider) in &tenant.providers {
                targets.push(DiscoveryTarget {
                    tenant_slug,
                    provider_name,
                    provider,
                });
            }
        }
        let outcomes = discover_all(&http_client, targets).await;
        for outcome in outcomes {
            if let Err(e) = &outcome.result {
                warnings.push(StartupWarning::ProviderDiscoveryFailed {
                    tenant: outcome.tenant_slug.clone(),
                    provider: outcome.provider_name.clone(),
                    error: e.to_string(),
                });
            }
            discovery_index.insert((outcome.tenant_slug, outcome.provider_name), outcome.result);
        }
    }

    let mut tenants = IndexMap::new();
    let mut host_index = IndexMap::new();

    for (tenant_slug, tenant_config) in bundle.tenants {
        let session_keys = EcKeyGenerations::new(load_ec_key_generations(
            &secrets,
            &tenant_slug,
            &tenant_config.session_key_generations,
            session_key_name_for_version,
            &mut warnings,
            KeyPurpose::Session,
        ));
        let internal_keys = EcKeyGenerations::new(load_ec_key_generations(
            &secrets,
            &tenant_slug,
            &tenant_config.internal_key_generations,
            internal_key_name_for_version,
            &mut warnings,
            KeyPurpose::Internal,
        ));

        let mut identity_hash_generations = Vec::new();
        for generation in &tenant_config.identity_hash_key_generations {
            let name = identity_hash_key_name(&tenant_slug, generation.version);
            match secrets.get(&name) {
                Ok(bytes) => identity_hash_generations.push((generation.version, bytes.to_vec())),
                Err(_) => warnings.push(StartupWarning::MissingIdentityHashKey {
                    tenant: tenant_slug.clone(),
                    version: generation.version,
                }),
            }
        }

        let mut provider_client_secrets = IndexMap::new();
        for name in tenant_config.providers.keys() {
            match secrets.get_string(&provider_client_secret_name(&tenant_slug, name)) {
                Ok(secret) => {
                    provider_client_secrets.insert(name.clone(), secret);
                }
                Err(_) => warnings.push(StartupWarning::MissingProviderClientSecret {
                    tenant: tenant_slug.clone(),
                    provider: name.clone(),
                }),
            }
        }

        let resolved_providers: IndexMap<String, Result<ResolvedProvider, DiscoveryError>> =
            tenant_config
                .providers
                .keys()
                .map(|name| {
                    let result = if !provider_client_secrets.contains_key(name) {
                        Err(DiscoveryError::Request(
                            "missing OAuth2 client secret".to_string(),
                        ))
                    } else {
                        discovery_index
                            .get(&(tenant_slug.clone(), name.clone()))
                            .cloned()
                            .unwrap_or_else(|| {
                                Err(DiscoveryError::Request(
                                    "discovery not attempted".to_string(),
                                ))
                            })
                    };
                    (name.clone(), result)
                })
                .collect();

        let mut applications = IndexMap::new();
        for (app_slug, app_config) in tenant_config.applications {
            let exposed_providers: Vec<ResolvedExposedProvider> = app_config
                .providers
                .iter()
                .map(|exposed| {
                    let working = resolved_providers
                        .get(exposed.name())
                        .map(|r| r.is_ok())
                        .unwrap_or(false);
                    ResolvedExposedProvider {
                        name: exposed.name().to_string(),
                        login_path: exposed.login_path(),
                        callback_path: exposed.callback_path(),
                        working,
                    }
                })
                .collect();

            let working_count = exposed_providers.iter().filter(|p| p.working).count();
            let login_url = app_config
                .auth
                .as_ref()
                .and_then(|a| a.login_url.clone())
                .or_else(|| match working_count {
                    0 => None,
                    1 => exposed_providers
                        .iter()
                        .find(|p| p.working)
                        .map(|p| p.login_path.clone()),
                    _ => Some("/oauth2/select".to_string()),
                });

            for host in &app_config.hosts {
                host_index.insert(host.clone(), (tenant_slug.clone(), app_slug.clone()));
            }

            applications.insert(
                app_slug.clone(),
                ApplicationRuntime {
                    slug: app_slug,
                    hosts: app_config.hosts,
                    public_url: app_config.server.public_url,
                    upstream: app_config.upstream,
                    cors: app_config.cors,
                    exempt: app_config.exempt,
                    login_url,
                    exposed_providers,
                },
            );
        }

        tenants.insert(
            tenant_slug.clone(),
            TenantRuntime {
                slug: tenant_slug,
                status: tenant_config.status,
                cookie: tenant_config.cookie,
                jwt: tenant_config.jwt,
                branding: tenant_config.branding,
                session_keys,
                internal_keys,
                identity_hash_keys: IdentityHashKeys::new(identity_hash_generations),
                providers: tenant_config.providers,
                provider_client_secrets,
                resolved_providers,
                applications,
            },
        );
    }

    let state = PortcullisState {
        tenants,
        host_index,
        web_upstream: bundle.web_upstream,
        http_client,
        proxy_http_client,
        enricher,
        tower_http_client,
        tower_base_url,
        keep_base_url,
    };

    (state, warnings)
}

enum KeyPurpose {
    Session,
    Internal,
}

/// ADR 0088: loads every in-window generation of a session/internal key. An absent/empty
/// `generations` list (the common case — a tenant that has never rotated) is treated exactly
/// as if `[{version: 1}]` had been declared, since `name_for_version` already resolves version 1
/// to the legacy unversioned secret name every tenant already has.
fn load_ec_key_generations(
    secrets: &RawSecrets,
    tenant_slug: &str,
    generations: &[KeyGeneration],
    name_for_version: fn(&str, u32) -> String,
    warnings: &mut Vec<StartupWarning>,
    purpose: KeyPurpose,
) -> Vec<(u32, Arc<EcKeyPair>)> {
    let implicit_v1 = [KeyGeneration {
        version: 1,
        effective_from: None,
    }];
    let generations = if generations.is_empty() {
        &implicit_v1[..]
    } else {
        generations
    };

    let mut loaded = Vec::new();
    for generation in generations {
        let name = name_for_version(tenant_slug, generation.version);
        match secrets.get(&name) {
            Ok(bytes) => match EcKeyPair::from_pem_bytes(bytes) {
                Ok(key) => loaded.push((generation.version, Arc::new(key))),
                Err(e) => warnings.push(match purpose {
                    KeyPurpose::Session => StartupWarning::InvalidSessionKey {
                        tenant: tenant_slug.to_string(),
                        version: generation.version,
                        error: e.to_string(),
                    },
                    KeyPurpose::Internal => StartupWarning::InvalidInternalKey {
                        tenant: tenant_slug.to_string(),
                        version: generation.version,
                        error: e.to_string(),
                    },
                }),
            },
            Err(_) => warnings.push(match purpose {
                KeyPurpose::Session => StartupWarning::MissingSessionKey {
                    tenant: tenant_slug.to_string(),
                    version: generation.version,
                },
                KeyPurpose::Internal => StartupWarning::MissingInternalKey {
                    tenant: tenant_slug.to_string(),
                    version: generation.version,
                },
            }),
        }
    }
    loaded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_port_removes_trailing_port() {
        assert_eq!(strip_port("example.com:8080"), "example.com");
        assert_eq!(strip_port("example.com"), "example.com");
    }
}
