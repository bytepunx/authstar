//! Behavior-tier integration tests: a real axum app (gate + CORS + oauth2 routes + a stub
//! "proxied" fallback), driven in-process via `tower::ServiceExt::oneshot` — no real sockets for
//! the app under test. The OIDC provider and tower are both faked with `wiremock` (real HTTP
//! servers bound to `127.0.0.1:0`, since the code under test makes real `reqwest` calls to
//! them) — this is the same shape ref-proxy's own integration tests used, and the same
//! philosophy the other authstar services' `TESTING.md`s describe for their behavior tier: real
//! request/response handling, faked external dependencies only.

use std::collections::HashMap;
use std::sync::Arc;

use authstar_config::bundle::Bundle;
use authstar_config::RawSecrets;
use authstar_middleware::api_key_verifier::{ApiKeyVerifier, TowerApiKeyVerifier, UnreachableApiKeyVerifier};
use authstar_middleware::enricher::{ClaimsEnricher, TowerClaimsEnricher, UnreachableEnricher};
use authstar_middleware::gate::auth_gate;
use authstar_middleware::router::{apply_auth_gate, apply_cors, oauth_routes};
use authstar_middleware::state::{build_state, HttpClients, PortcullisState};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::middleware::from_fn_with_state;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use base64::Engine;
use http_body_util::BodyExt;
use p256::pkcs8::{EncodePrivateKey, LineEnding};
use p256::SecretKey;
use serde_json::json;
use tower::ServiceExt;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

// ---------------------------------------------------------------------------------------------
// Test key generation (p256 is already a normal dependency of authstar-middleware, so it's
// available here without any extra dev-dependency).
// ---------------------------------------------------------------------------------------------

struct OsRngAdapter;
impl p256::elliptic_curve::rand_core::RngCore for OsRngAdapter {
    fn next_u32(&mut self) -> u32 {
        rand::rngs::OsRng.next_u32()
    }
    fn next_u64(&mut self) -> u64 {
        rand::rngs::OsRng.next_u64()
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        rand::rngs::OsRng.fill_bytes(dest)
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        rand::rngs::OsRng.fill_bytes(dest);
        Ok(())
    }
}
impl p256::elliptic_curve::rand_core::CryptoRng for OsRngAdapter {}

fn generate_pem_key() -> String {
    SecretKey::random(&mut OsRngAdapter)
        .to_pkcs8_pem(LineEnding::LF)
        .unwrap()
        .to_string()
}

fn b64(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s)
}

// ---------------------------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------------------------

struct Harness {
    app: Router,
    #[allow(dead_code)]
    oidc_server: MockServer,
    tower_server: MockServer,
}

async fn build_harness() -> Harness {
    let oidc_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "authorization_endpoint": format!("{}/authorize", oidc_server.uri()),
            "token_endpoint": format!("{}/token", oidc_server.uri()),
            "userinfo_endpoint": format!("{}/userinfo", oidc_server.uri()),
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "test-access-token",
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "email": "user@example.com",
            "sub": "provider-sub-123",
        })))
        .mount(&oidc_server)
        .await;

    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/identities/resolve"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1",
            "isNewAccount": false,
        })))
        .mount(&tower_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/enrich"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1",
            "grantedRoles": ["member"],
            "trialRoles": [],
            "trialExpiresAt": null,
            "usage": {},
        })))
        .mount(&tower_server)
        .await;

    let state = build_state_for(&oidc_server.uri(), &tower_server.uri()).await;
    let app = build_app(state);

    Harness {
        app,
        oidc_server,
        tower_server,
    }
}

async fn build_state_for(oidc_base: &str, tower_base: &str) -> Arc<PortcullisState> {
    build_state_with_enricher_base(oidc_base, tower_base, tower_base).await
}

/// Like [`build_state_for`], but lets the `/enrich` calls (via the [`ClaimsEnricher`]) target a
/// different base URL than `/identities/resolve` (used directly by the callback handler via
/// `PortcullisState::tower_base_url`) — needed to simulate "identity resolution works fine at
/// login time, but tower becomes unreachable later for per-request enrichment" without a whole
/// separate bundle/harness.
async fn build_state_with_enricher_base(
    oidc_base: &str,
    identities_tower_base: &str,
    enrich_tower_base: &str,
) -> Arc<PortcullisState> {
    let session_key = generate_pem_key();
    let internal_key = generate_pem_key();
    let identity_hash_key = "identity-hash-key-material";

    let bundle_json = json!({
        "tenants": {
            "acme": {
                "status": "active",
                "providers": {
                    "testidp": {
                        "clientId": "client-123",
                        "discoveryUrl": oidc_base,
                        "scope": ["openid", "email"],
                    }
                },
                "cookie": {
                    "domain": "app.acme.test",
                    "path": "/",
                    "maxAge": 604800,
                    "httpOnly": true,
                    "secure": false,
                },
                "jwt": {
                    "issuer": "authstar",
                    "audience": "acme",
                    "expiresIn": "168h",
                },
                "identityHashKeyGenerations": [
                    { "version": 1 }
                ],
                "applications": {
                    "app": {
                        "hosts": ["app.acme.test"],
                        "server": { "publicUrl": "http://app.acme.test" },
                        "upstream": {
                            "base": "http://upstream.invalid",
                            "routes": {},
                            "timeout": 30,
                        },
                        "cors": { "origin": "https://allowed.example.com" },
                        "exempt": ["/health", "/api/public/*"],
                        "providers": ["testidp"],
                    }
                }
            }
        },
        "secrets": {
            "tenant-acme-session-key": b64(&session_key),
            "tenant-acme-internal-key": b64(&internal_key),
            "tenant-acme-identity-hash-key-1": b64(identity_hash_key),
            "tenant-acme-provider-testidp-client-secret": b64("provider-client-secret"),
        }
    });

    let config: Bundle = serde_json::from_value(bundle_json.clone()).unwrap();
    let secrets = RawSecrets::from_bundle_json(&bundle_json).unwrap();
    let http_client = reqwest::Client::new();
    let enricher: Arc<dyn ClaimsEnricher> = Arc::new(TowerClaimsEnricher::new(
        http_client.clone(),
        enrich_tower_base.to_string(),
    ));

    let (state, warnings) = build_state(
        config,
        secrets,
        HttpClients {
            http_client: http_client.clone(),
            proxy_http_client: http_client.clone(),
            tower_http_client: http_client,
        },
        enricher,
        Arc::new(UnreachableApiKeyVerifier),
        identities_tower_base.to_string(),
        String::new(),
    )
    .await;
    assert!(
        warnings.is_empty(),
        "expected no startup warnings, got: {:?}",
        warnings.iter().map(|w| w.to_string()).collect::<Vec<_>>()
    );
    Arc::new(state)
}

/// Similar tenant/bundle shape to [`build_state_with_enricher_base`], but wires a real
/// [`TowerApiKeyVerifier`] pointed at `tower_base` instead of the placeholder
/// [`UnreachableApiKeyVerifier`] every other helper here uses -- for the
/// design/adrs/0101-api-keys.md gate tests below, which send `Authorization: Bearer
/// authstar_...` directly and never establish a session cookie at all, so no OIDC provider
/// (and thus no `oidc_base` param) is needed, and the (deliberately unreachable) `enricher` is
/// never touched.
async fn build_state_with_api_key_verifier(tower_base: &str) -> Arc<PortcullisState> {
    let session_key = generate_pem_key();
    let internal_key = generate_pem_key();
    let identity_hash_key = "identity-hash-key-material";

    // No `providers` at all -- these tests exercise only the API-key Bearer path, never the
    // OIDC login flow, so no discovery mock is needed (unlike every other helper in this file).
    let bundle_json = json!({
        "tenants": {
            "acme": {
                "status": "active",
                "cookie": {
                    "domain": "app.acme.test",
                    "path": "/",
                    "maxAge": 604800,
                    "httpOnly": true,
                    "secure": false,
                },
                "jwt": {
                    "issuer": "authstar",
                    "audience": "acme",
                    "expiresIn": "168h",
                },
                "identityHashKeyGenerations": [
                    { "version": 1 }
                ],
                "applications": {
                    "app": {
                        "hosts": ["app.acme.test"],
                        "server": { "publicUrl": "http://app.acme.test" },
                        "upstream": {
                            "base": "http://upstream.invalid",
                            "routes": {},
                            "timeout": 30,
                        },
                        "cors": { "origin": "https://allowed.example.com" },
                        "exempt": ["/health", "/api/public/*"],
                    }
                }
            }
        },
        "secrets": {
            "tenant-acme-session-key": b64(&session_key),
            "tenant-acme-internal-key": b64(&internal_key),
            "tenant-acme-identity-hash-key-1": b64(identity_hash_key),
        }
    });

    let config: Bundle = serde_json::from_value(bundle_json.clone()).unwrap();
    let secrets = RawSecrets::from_bundle_json(&bundle_json).unwrap();
    let http_client = reqwest::Client::new();
    let api_key_verifier: Arc<dyn ApiKeyVerifier> = Arc::new(TowerApiKeyVerifier::new(
        http_client.clone(),
        tower_base.to_string(),
    ));

    let (state, warnings) = build_state(
        config,
        secrets,
        HttpClients {
            http_client: http_client.clone(),
            proxy_http_client: http_client.clone(),
            tower_http_client: http_client,
        },
        Arc::new(UnreachableEnricher),
        api_key_verifier,
        tower_base.to_string(),
        String::new(),
    )
    .await;
    assert!(
        warnings.is_empty(),
        "expected no startup warnings, got: {:?}",
        warnings.iter().map(|w| w.to_string()).collect::<Vec<_>>()
    );
    Arc::new(state)
}

/// Same tenant as [`build_state_with_enricher_base`] (same session/internal keys, so a cookie
/// signed for "app.acme.test" verifies just as well here -- ADR 0015's shared `.{domain}` SSO
/// cookie is tenant-scoped, not application-scoped, by design), plus a second application
/// ("raw.acme.test") with no `providers`/`auth.loginUrl` configured at all and fully exempt --
/// modelling bytepunx's own real `argocd`/`writingdesk` applications, raw passthrough upstreams
/// with no relationship to authstar's login system whatsoever.
async fn build_state_with_raw_exempt_app(oidc_base: &str, tower_base: &str) -> Arc<PortcullisState> {
    let session_key = generate_pem_key();
    let internal_key = generate_pem_key();
    let identity_hash_key = "identity-hash-key-material";

    let bundle_json = json!({
        "tenants": {
            "acme": {
                "status": "active",
                "providers": {
                    "testidp": {
                        "clientId": "client-123",
                        "discoveryUrl": oidc_base,
                        "scope": ["openid", "email"],
                    }
                },
                "cookie": {
                    "domain": "app.acme.test",
                    "path": "/",
                    "maxAge": 604800,
                    "httpOnly": true,
                    "secure": false,
                },
                "jwt": {
                    "issuer": "authstar",
                    "audience": "acme",
                    "expiresIn": "168h",
                },
                "identityHashKeyGenerations": [
                    { "version": 1 }
                ],
                "applications": {
                    "app": {
                        "hosts": ["app.acme.test"],
                        "server": { "publicUrl": "http://app.acme.test" },
                        "upstream": {
                            "base": "http://upstream.invalid",
                            "routes": {},
                            "timeout": 30,
                        },
                        "cors": { "origin": "https://allowed.example.com" },
                        "exempt": ["/health", "/api/public/*"],
                        "providers": ["testidp"],
                    },
                    "raw": {
                        "hosts": ["raw.acme.test"],
                        "server": { "publicUrl": "http://raw.acme.test" },
                        "upstream": {
                            "base": "http://raw-upstream.invalid",
                            "routes": {},
                            "timeout": 30,
                        },
                        "exempt": ["/*"],
                    }
                }
            }
        },
        "secrets": {
            "tenant-acme-session-key": b64(&session_key),
            "tenant-acme-internal-key": b64(&internal_key),
            "tenant-acme-identity-hash-key-1": b64(identity_hash_key),
            "tenant-acme-provider-testidp-client-secret": b64("provider-client-secret"),
        }
    });

    let config: Bundle = serde_json::from_value(bundle_json.clone()).unwrap();
    let secrets = RawSecrets::from_bundle_json(&bundle_json).unwrap();
    let http_client = reqwest::Client::new();
    let enricher: Arc<dyn ClaimsEnricher> = Arc::new(TowerClaimsEnricher::new(
        http_client.clone(),
        tower_base.to_string(),
    ));

    let (state, warnings) = build_state(
        config,
        secrets,
        HttpClients {
            http_client: http_client.clone(),
            proxy_http_client: http_client.clone(),
            tower_http_client: http_client,
        },
        enricher,
        Arc::new(UnreachableApiKeyVerifier),
        tower_base.to_string(),
        String::new(),
    )
    .await;
    assert!(
        warnings.is_empty(),
        "expected no startup warnings, got: {:?}",
        warnings.iter().map(|w| w.to_string()).collect::<Vec<_>>()
    );
    Arc::new(state)
}

/// A stub "upstream" handler standing in for the real reverse-proxy forwarding logic (tested
/// separately, with its own routing concerns, in authstar-proxy). Reflects whether an internal
/// token was attached so gate behavior can be asserted on directly.
async fn stub_fallback(req: Request<Body>) -> axum::response::Response {
    let ctx = req
        .extensions()
        .get::<authstar_middleware::context::ForwardContext>()
        .cloned();
    match ctx {
        Some(c) => (
            StatusCode::OK,
            [
                (
                    "x-internal-token-present",
                    if c.internal_token.is_some() {
                        "true"
                    } else {
                        "false"
                    },
                ),
                (
                    "x-internal-token",
                    c.internal_token.as_deref().unwrap_or(""),
                ),
            ],
            "ok",
        )
            .into_response(),
        None => (StatusCode::INTERNAL_SERVER_ERROR, "no forward context").into_response(),
    }
}

fn build_app(state: Arc<PortcullisState>) -> Router {
    let proxy_router: Router<Arc<PortcullisState>> = Router::new().fallback(stub_fallback);
    let proxy_router = apply_auth_gate(proxy_router, state.clone());

    let app: Router<Arc<PortcullisState>> = Router::new().merge(oauth_routes()).merge(proxy_router);
    let app = apply_cors(app, state.clone());
    app.with_state(state)
}

async fn body_string(response: axum::response::Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

fn set_cookie_headers(response: &axum::response::Response) -> Vec<String> {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Gate: unauthenticated
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn unauthenticated_browser_request_redirects_with_return_cookie() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ACCEPT, "text/html")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);
    let location = response
        .headers()
        .get(header::LOCATION)
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(location, "/oauth2/testidp/login"); // single working provider -> direct login path

    let cookies = set_cookie_headers(&response);
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("authstar-return=/dashboard")));
}

#[tokio::test]
async fn unauthenticated_api_client_gets_401() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ACCEPT, "application/json")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response.headers().get(header::WWW_AUTHENTICATE).unwrap(),
        "Bearer realm=\"authstar\""
    );
    let body = body_string(response).await;
    assert!(body.contains("Unauthorized"));
}

#[tokio::test]
async fn exempt_route_forwards_without_authentication() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/health")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "false"
    );
}

#[tokio::test]
async fn exempt_wildcard_route_matches_subpath() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/api/public/widgets")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn unknown_host_is_404() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/")
        .header(header::HOST, "nowhere.invalid")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------------------------
// OAuth2 login initiation (Story 005)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn login_redirects_to_provider_with_pkce_and_state() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/testidp/login")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);
    let location = response
        .headers()
        .get(header::LOCATION)
        .unwrap()
        .to_str()
        .unwrap();
    assert!(location.contains("/authorize"));
    assert!(location.contains("response_type=code"));
    assert!(location.contains("client_id=client-123"));
    assert!(location.contains("code_challenge_method=S256"));
    assert!(location.contains("state="));

    let cookies = set_cookie_headers(&response);
    assert!(cookies.iter().any(|c| c.starts_with("oauth2-state=")));
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("oauth2-pkce-verifier=")));
}

// ADR 0092: an invite token on the login-initiating request survives the
// OAuth round trip via a short-lived cookie, and is forwarded to tower's
// /identities/resolve on callback.

#[tokio::test]
async fn login_with_invite_param_sets_pending_invite_cookie() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/testidp/login?invite=inv-token-123")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    let cookies = set_cookie_headers(&response);
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("authstar-pending-invite=inv-token-123")));
}

#[tokio::test]
async fn login_without_invite_param_sets_no_pending_invite_cookie() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/testidp/login")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    let cookies = set_cookie_headers(&response);
    assert!(!cookies
        .iter()
        .any(|c| c.starts_with("authstar-pending-invite=")));
}

#[tokio::test]
async fn select_page_with_invite_param_sets_pending_invite_cookie() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/select?invite=inv-token-456")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    let cookies = set_cookie_headers(&response);
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("authstar-pending-invite=inv-token-456")));
}

#[tokio::test]
async fn callback_forwards_pending_invite_to_tower_and_clears_the_cookie() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/testidp/login?invite=inv-token-789")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let login_response = harness.app.clone().oneshot(req).await.unwrap();
    let login_cookies = set_cookie_headers(&login_response);
    let mut flow_cookies = HashMap::new();
    flow_cookies.insert(
        "oauth2-state".to_string(),
        extract_cookie_value(&login_cookies, "oauth2-state"),
    );
    flow_cookies.insert(
        "oauth2-pkce-verifier".to_string(),
        extract_cookie_value(&login_cookies, "oauth2-pkce-verifier"),
    );
    flow_cookies.insert(
        "authstar-pending-invite".to_string(),
        extract_cookie_value(&login_cookies, "authstar-pending-invite"),
    );
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&flow_cookies))
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);

    // The pending-invite cookie is cleared regardless of outcome, same as
    // the other single-attempt flow cookies.
    let cookies = set_cookie_headers(&response);
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("authstar-pending-invite=") && c.contains("Max-Age=0")));

    // tower actually received the redeem payload.
    let requests = harness.tower_server.received_requests().await.unwrap();
    let resolve_request = requests
        .iter()
        .find(|r| r.url.path() == "/identities/resolve")
        .expect("no /identities/resolve request recorded");
    let body: serde_json::Value = resolve_request.body_json().unwrap();
    assert_eq!(
        body["redeem"],
        json!({ "type": "invite", "token": "inv-token-789" })
    );
}

#[tokio::test]
async fn callback_without_pending_invite_sends_no_redeem_field() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&flow_cookies))
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);

    let requests = harness.tower_server.received_requests().await.unwrap();
    let resolve_request = requests
        .iter()
        .find(|r| r.url.path() == "/identities/resolve")
        .expect("no /identities/resolve request recorded");
    let body: serde_json::Value = resolve_request.body_json().unwrap();
    assert!(body.get("redeem").is_none());
}

#[tokio::test]
async fn login_for_unknown_provider_is_404() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/nope/login")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------------------------
// OAuth2 callback (Story 006)
// ---------------------------------------------------------------------------------------------

fn extract_cookie_value(cookies: &[String], name: &str) -> String {
    cookies
        .iter()
        .find_map(|c| {
            let prefix = format!("{name}=");
            c.strip_prefix(&prefix)
                .map(|rest| rest.split(';').next().unwrap().to_string())
        })
        .unwrap_or_else(|| panic!("cookie {name} not found in {cookies:?}"))
}

async fn perform_login(app: &Router) -> HashMap<String, String> {
    let req = Request::builder()
        .uri("/oauth2/testidp/login")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    let cookies = set_cookie_headers(&response);
    let mut map = HashMap::new();
    map.insert(
        "oauth2-state".to_string(),
        extract_cookie_value(&cookies, "oauth2-state"),
    );
    map.insert(
        "oauth2-pkce-verifier".to_string(),
        extract_cookie_value(&cookies, "oauth2-pkce-verifier"),
    );
    map
}

fn cookie_header(cookies: &HashMap<String, String>) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

#[tokio::test]
async fn callback_with_valid_code_and_state_issues_session() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&flow_cookies))
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/");

    let cookies = set_cookie_headers(&response);
    assert!(cookies.iter().any(|c| c.starts_with("jwt=")));
    // Flow cookies must always be cleared.
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("oauth2-state=") && c.contains("Max-Age=0")));
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("oauth2-pkce-verifier=") && c.contains("Max-Age=0")));
}

#[tokio::test]
async fn callback_with_return_url_redirects_there() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();
    let mut cookies_with_return = flow_cookies.clone();
    cookies_with_return.insert("authstar-return".to_string(), "/billing".to_string());

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&cookies_with_return))
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/billing"
    );
}

#[tokio::test]
async fn callback_rejects_unsafe_return_url() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();
    let mut cookies_with_return = flow_cookies.clone();
    cookies_with_return.insert("authstar-return".to_string(), "//evil.com".to_string());

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&cookies_with_return))
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/");
}

#[tokio::test]
async fn callback_state_mismatch_is_400() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;

    let req = Request::builder()
        .uri("/oauth2/testidp/callback?code=abc123&state=wrong-state")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&flow_cookies))
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn callback_missing_pkce_verifier_is_400() {
    let harness = build_harness().await;
    let flow_cookies = perform_login(&harness.app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("oauth2-state={state_value}"))
        .body(Body::empty())
        .unwrap();

    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------------------------
// Authenticated request through the gate -> enrichment -> internal token (Story 009/010/013)
// ---------------------------------------------------------------------------------------------

async fn login_and_get_session_cookie(app: &Router) -> String {
    let flow_cookies = perform_login(app).await;
    let state_value = flow_cookies.get("oauth2-state").unwrap().clone();

    let req = Request::builder()
        .uri(format!(
            "/oauth2/testidp/callback?code=abc123&state={state_value}"
        ))
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, cookie_header(&flow_cookies))
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    let cookies = set_cookie_headers(&response);
    extract_cookie_value(&cookies, "jwt")
}

#[tokio::test]
async fn authenticated_request_with_allow_outcome_gets_internal_token() {
    let harness = build_harness().await;
    let jwt = login_and_get_session_cookie(&harness.app).await;

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "true"
    );
}

#[tokio::test]
async fn authenticated_exempt_route_still_gets_internal_token() {
    // Opportunistic auth: exempt doesn't mean "never authenticate," it means "don't require it."
    let harness = build_harness().await;
    let jwt = login_and_get_session_cookie(&harness.app).await;

    let req = Request::builder()
        .uri("/health")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "true"
    );
}

#[tokio::test]
async fn exempt_route_on_an_app_with_no_login_url_never_gets_a_token_even_with_a_valid_session() {
    // Regression: a visitor holding a valid session cookie for one application (minted while
    // logging into "app.acme.test", a real authstar-integrated app) must never have that
    // identity forwarded to a completely different, raw-passthrough application sharing the
    // same tenant's cookie domain (ADR 0015) just because the cookie happens to verify --
    // "raw.acme.test" never established an authstar login flow of its own (no providers, no
    // auth.loginUrl) and has no idea what to do with an Authorization header carrying someone
    // else's internal JWT. This is exactly what broke ArgoCD's own session handling in
    // production: portcullis attached a real internal token to every request reaching the
    // fully-exempt, non-authstar-aware argocd application whenever the visitor also held a live
    // bytepunx admin-console session, and ArgoCD's server tried to verify that token as its own,
    // saw an issuer that wasn't "argocd", and permanently bounced real logins back to its own
    // login screen.
    let oidc_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "authorization_endpoint": format!("{}/authorize", oidc_server.uri()),
            "token_endpoint": format!("{}/token", oidc_server.uri()),
            "userinfo_endpoint": format!("{}/userinfo", oidc_server.uri()),
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "test-access-token",
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "email": "user@example.com",
            "sub": "provider-sub-123",
        })))
        .mount(&oidc_server)
        .await;

    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/identities/resolve"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1",
            "isNewAccount": false,
        })))
        .mount(&tower_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/enrich"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1",
            "grantedRoles": ["member"],
            "trialRoles": [],
            "trialExpiresAt": null,
            "usage": {},
        })))
        .mount(&tower_server)
        .await;

    let state = build_state_with_raw_exempt_app(&oidc_server.uri(), &tower_server.uri()).await;
    let app = build_app(state);

    let jwt = login_and_get_session_cookie(&app).await;

    let req = Request::builder()
        .uri("/anything")
        .header(header::HOST, "raw.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "false"
    );
}

#[tokio::test]
async fn invalid_jwt_is_treated_as_unauthenticated() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ACCEPT, "application/json")
        .header(header::COOKIE, "jwt=not-a-real-token")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------------------------
// Enrichment Deny / Unreachable outcomes (Story 013/015)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn deny_outcome_rejects_protected_route_with_tower_status() {
    let oidc_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "authorization_endpoint": format!("{}/authorize", oidc_server.uri()),
            "token_endpoint": format!("{}/token", oidc_server.uri()),
            "userinfo_endpoint": format!("{}/userinfo", oidc_server.uri()),
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"access_token": "t"})))
        .mount(&oidc_server)
        .await;
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "email": "user@example.com", "sub": "sub-1"
        })))
        .mount(&oidc_server)
        .await;

    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/identities/resolve"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1", "isNewAccount": false
        })))
        .mount(&tower_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/enrich"))
        .respond_with(
            ResponseTemplate::new(403).set_body_json(json!({"reason": "no active subscription"})),
        )
        .mount(&tower_server)
        .await;

    let state = build_state_for(&oidc_server.uri(), &tower_server.uri()).await;
    let app = build_app(state);

    let jwt = login_and_get_session_cookie(&app).await;

    let protected_req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(protected_req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let exempt_req = Request::builder()
        .uri("/health")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(exempt_req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "false"
    );
}

#[tokio::test]
async fn unreachable_tower_fails_open_with_degraded_token() {
    let oidc_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "authorization_endpoint": format!("{}/authorize", oidc_server.uri()),
            "token_endpoint": format!("{}/token", oidc_server.uri()),
            "userinfo_endpoint": format!("{}/userinfo", oidc_server.uri()),
        })))
        .mount(&oidc_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"access_token": "t"})))
        .mount(&oidc_server)
        .await;
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "email": "user@example.com", "sub": "sub-1"
        })))
        .mount(&oidc_server)
        .await;

    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/identities/resolve"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "accountId": "acct-1", "isNewAccount": false
        })))
        .mount(&tower_server)
        .await;
    // No /enrich mock registered at all would just get wiremock's default 404 (a real HTTP
    // response, i.e. Deny(404) — not what this test wants). Point *only* the enricher at a port
    // nothing listens on, to force a genuine connection failure -> Unreachable, while identity
    // resolution at login time still succeeds against the real tower mock.
    let state = build_state_with_enricher_base(
        &oidc_server.uri(),
        &tower_server.uri(),
        "http://127.0.0.1:1",
    )
    .await;
    let app = build_app(state);

    let jwt = login_and_get_session_cookie(&app).await;

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    // Fail-open: still forwarded, still gets a (degraded) internal token.
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "true"
    );
}

// ---------------------------------------------------------------------------------------------
// API keys (design/adrs/0101-api-keys.md)
// ---------------------------------------------------------------------------------------------

fn decode_claims(token: &str) -> serde_json::Value {
    let payload_b64 = token.split('.').nth(1).unwrap();
    let payload_json = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .unwrap();
    serde_json::from_slice(&payload_json).unwrap()
}

#[tokio::test]
async fn api_key_allow_outcome_gets_internal_token_carrying_api_key_id() {
    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/verify-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "outcome": "allow",
            "apiKeyId": "apikey-1",
            "sub": "admin@example.com",
            "accountId": "acct-1",
            "grantedRoles": ["read"],
            "permissions": [],
            "usage": [],
            "rateLimit": null,
        })))
        .mount(&tower_server)
        .await;

    let state = build_state_with_api_key_verifier(&tower_server.uri()).await;
    let app = build_app(state);

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::AUTHORIZATION, "Bearer authstar_apikey-1_c2VjcmV0")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "true"
    );

    let internal_token = response
        .headers()
        .get("x-internal-token")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let claims = decode_claims(&internal_token);
    assert_eq!(claims["apiKeyId"], "apikey-1");
    assert_eq!(claims["accountId"], "acct-1");
    assert_eq!(claims["sub"], "admin@example.com");
    assert_eq!(claims["roles"], json!(["read"]));
    assert_eq!(claims["enrichmentStatus"], "ok");
}

#[tokio::test]
async fn org_owned_api_key_allow_outcome_has_no_account_id() {
    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/verify-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "outcome": "allow",
            "apiKeyId": "apikey-2",
            "sub": "apikey:apikey-2",
            "grantedRoles": [],
        })))
        .mount(&tower_server)
        .await;

    let state = build_state_with_api_key_verifier(&tower_server.uri()).await;
    let app = build_app(state);

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::AUTHORIZATION, "Bearer authstar_apikey-2_c2VjcmV0")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    let internal_token = response
        .headers()
        .get("x-internal-token")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let claims = decode_claims(&internal_token);
    assert_eq!(claims["sub"], "apikey:apikey-2");
    assert!(claims.get("accountId").is_none());
}

#[tokio::test]
async fn api_key_deny_outcome_is_401_never_a_redirect() {
    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/verify-api-key"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({"error": "Forbidden"})))
        .mount(&tower_server)
        .await;

    let state = build_state_with_api_key_verifier(&tower_server.uri()).await;
    let app = build_app(state);

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ACCEPT, "text/html") // would trigger a browser redirect on the ordinary no-session path
        .header(header::AUTHORIZATION, "Bearer authstar_apikey-1_wrongsecret")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn malformed_bearer_credential_is_401_never_a_redirect() {
    let tower_server = MockServer::start().await;
    // No mock mounted for /verify-api-key -- a malformed credential must never even reach it.

    let state = build_state_with_api_key_verifier(&tower_server.uri()).await;
    let app = build_app(state);

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ACCEPT, "text/html")
        .header(header::AUTHORIZATION, "Bearer not-an-api-key-at-all")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn unreachable_tower_denies_api_key_requests_instead_of_failing_open() {
    // Unlike the session path (`unreachable_tower_fails_open_with_degraded_token`), an API key is
    // not self-verifying -- nothing about it is checked without tower, so an unreachable tower
    // must deny, not mint a degraded token for an entirely unverified credential.
    // A connection-refused base (nothing listens on port 1) rather than a mounted mock with no
    // matching route -- the latter would be a `Deny(404)`, not `Unreachable`.
    let state =
        build_state_with_api_key_verifier("http://127.0.0.1:1").await;
    let app = build_app(state);

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::AUTHORIZATION, "Bearer authstar_apikey-1_secret")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(response.headers().get("x-internal-token-present").is_none());
}

#[tokio::test]
async fn api_key_exceeding_its_rate_limit_gets_429() {
    let tower_server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/verify-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "outcome": "allow",
            "apiKeyId": "apikey-1",
            "sub": "admin@example.com",
            "accountId": "acct-1",
            "grantedRoles": ["read"],
            "rateLimit": {"requestsPerMinute": 1},
        })))
        .mount(&tower_server)
        .await;

    let state = build_state_with_api_key_verifier(&tower_server.uri()).await;
    let app = build_app(state);

    let make_req = || {
        Request::builder()
            .uri("/dashboard")
            .header(header::HOST, "app.acme.test")
            .header(header::AUTHORIZATION, "Bearer authstar_apikey-1_c2VjcmV0")
            .body(Body::empty())
            .unwrap()
    };

    let first = app.clone().oneshot(make_req()).await.unwrap();
    assert_eq!(first.status(), StatusCode::OK);

    let second = app.oneshot(make_req()).await.unwrap();
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
}

// ---------------------------------------------------------------------------------------------
// Logout (Story 016)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn logout_clears_session_cookie_and_redirects() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/logout")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/");
    let cookies = set_cookie_headers(&response);
    assert!(cookies
        .iter()
        .any(|c| c.starts_with("jwt=") && c.contains("Max-Age=0")));
}

// ---------------------------------------------------------------------------------------------
// /oauth2/providers and /oauth2/select (Stories 017/018)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn providers_endpoint_lists_working_providers() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/providers")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_string(response).await;
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(parsed[0]["id"], "testidp");
    assert_eq!(parsed[0]["name"], "Testidp");
    assert_eq!(parsed[0]["loginUrl"], "/oauth2/testidp/login");
}

// ---------------------------------------------------------------------------------------------
// JWKS (ADR 0086/0087)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn jwks_endpoint_serves_the_tenants_internal_key_unauthenticated() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/.well-known/jwks.json")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_string(response).await;
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    let keys = parsed["keys"].as_array().expect("keys array");
    assert_eq!(keys.len(), 1);
    let key = &keys[0];
    assert_eq!(key["kty"], "EC");
    assert_eq!(key["crv"], "P-256");
    assert_eq!(key["use"], "sig");
    assert_eq!(key["alg"], "ES256");
    assert!(!key["kid"].as_str().unwrap().is_empty());
    assert!(!key["x"].as_str().unwrap().is_empty());
    assert!(!key["y"].as_str().unwrap().is_empty());
    assert!(key["publicKeyPem"]
        .as_str()
        .unwrap()
        .starts_with("-----BEGIN PUBLIC KEY-----"));
}

#[tokio::test]
async fn jwks_kid_matches_the_kid_on_an_actually_issued_internal_token() {
    // The whole point of a JWKS endpoint is letting a downstream service pick the right key by
    // `kid` -- prove the two actually agree, not just that both individually look well-formed.
    let harness = build_harness().await;
    let jwt = login_and_get_session_cookie(&harness.app).await;

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={jwt}"))
        .body(Body::empty())
        .unwrap();
    let response = harness.app.clone().oneshot(req).await.unwrap();
    let internal_token = response
        .headers()
        .get("x-internal-token")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let header = jsonwebtoken::decode_header(&internal_token).unwrap();

    let jwks_req = Request::builder()
        .uri("/.well-known/jwks.json")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let jwks_response = harness.app.oneshot(jwks_req).await.unwrap();
    let body = body_string(jwks_response).await;
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();

    assert_eq!(parsed["keys"][0]["kid"], header.kid.unwrap());
}

#[tokio::test]
async fn jwks_endpoint_is_404_for_unknown_host() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/.well-known/jwks.json")
        .header(header::HOST, "nowhere.invalid")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Minimal state with two generations declared for both session and internal keys (ADR 0088) --
/// no providers configured, so `build_state`'s OIDC discovery has nothing to do and no wiremock
/// server is needed. Returns the app plus the four raw PEM keys so a test can sign a token under
/// whichever generation it needs directly, bypassing portcullis's own sign_session/sign_internal.
async fn build_rotated_keys_harness() -> (Router, String, String, String, String) {
    let session_key_v1 = generate_pem_key();
    let session_key_v2 = generate_pem_key();
    let internal_key_v1 = generate_pem_key();
    let internal_key_v2 = generate_pem_key();

    let bundle_json = json!({
        "tenants": {
            "acme": {
                "status": "active",
                "cookie": {
                    "domain": "app.acme.test",
                    "path": "/",
                    "maxAge": 604800,
                    "httpOnly": true,
                    "secure": false,
                },
                "jwt": {
                    "issuer": "authstar",
                    "audience": "acme",
                    "expiresIn": "168h",
                },
                "identityHashKeyGenerations": [{ "version": 1 }],
                "sessionKeyGenerations": [{ "version": 1 }, { "version": 2 }],
                "internalKeyGenerations": [{ "version": 1 }, { "version": 2 }],
                "applications": {
                    "app": {
                        "hosts": ["app.acme.test"],
                        "server": { "publicUrl": "http://app.acme.test" },
                        "upstream": { "base": "http://upstream.invalid", "routes": {}, "timeout": 30 },
                        "exempt": [],
                    }
                }
            }
        },
        "secrets": {
            "tenant-acme-session-key": b64(&session_key_v1),
            "tenant-acme-session-key-2": b64(&session_key_v2),
            "tenant-acme-internal-key": b64(&internal_key_v1),
            "tenant-acme-internal-key-2": b64(&internal_key_v2),
            "tenant-acme-identity-hash-key-1": b64("identity-hash-key-material"),
        }
    });

    let config: Bundle = serde_json::from_value(bundle_json.clone()).unwrap();
    let secrets = RawSecrets::from_bundle_json(&bundle_json).unwrap();
    let http_client = reqwest::Client::new();
    let (state, warnings) = build_state(
        config,
        secrets,
        HttpClients {
            http_client: http_client.clone(),
            proxy_http_client: http_client.clone(),
            tower_http_client: http_client,
        },
        Arc::new(UnreachableEnricher),
        Arc::new(UnreachableApiKeyVerifier),
        "http://tower.invalid".to_string(),
        String::new(),
    )
    .await;
    assert!(
        warnings.is_empty(),
        "expected no startup warnings, got: {:?}",
        warnings.iter().map(|w| w.to_string()).collect::<Vec<_>>()
    );

    let app = build_app(Arc::new(state));
    (
        app,
        session_key_v1,
        session_key_v2,
        internal_key_v1,
        internal_key_v2,
    )
}

#[tokio::test]
async fn jwks_serves_both_internal_key_generations_during_rotation_overlap() {
    let (app, _sk1, _sk2, ik1, ik2) = build_rotated_keys_harness().await;
    let v1_kid = authstar_middleware::keys::EcKeyPair::from_pem_bytes(ik1.as_bytes())
        .unwrap()
        .kid;
    let v2_kid = authstar_middleware::keys::EcKeyPair::from_pem_bytes(ik2.as_bytes())
        .unwrap()
        .kid;

    let req = Request::builder()
        .uri("/.well-known/jwks.json")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_string(response).await;
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    let kids: Vec<String> = parsed["keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k["kid"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(
        kids.len(),
        2,
        "expected both generations in the keys array, got: {kids:?}"
    );
    assert!(
        kids.contains(&v1_kid),
        "previous generation missing from JWKS during overlap"
    );
    assert!(
        kids.contains(&v2_kid),
        "current generation missing from JWKS"
    );
}

#[tokio::test]
async fn session_cookie_signed_under_previous_generation_still_authenticates_during_overlap() {
    let (app, sk1, _sk2, _ik1, _ik2) = build_rotated_keys_harness().await;

    // Sign a session JWT directly under the *previous* generation's raw key -- simulating a
    // cookie that was issued before rotation happened, now arriving after the tenant's current
    // key has moved on to version 2.
    let key = authstar_middleware::keys::EcKeyPair::from_pem_bytes(sk1.as_bytes()).unwrap();
    let token = authstar_middleware::jwt::session::sign_session(
        &key,
        authstar_middleware::jwt::session::SignSessionParams {
            email: "admin@example.com",
            idp: "dex",
            identity_hash: "abc123",
            issuer: "authstar",
            audience: "acme",
            expires_in: "168h",
        },
    )
    .unwrap();

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::COOKIE, format!("jwt={token}"))
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();

    // No enricher configured (UnreachableEnricher) -> fails open with a degraded internal token
    // rather than redirecting to login -- which only happens at all if session verification
    // itself succeeded. A still-unauthenticated request would instead get a 302 redirect.
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-internal-token-present").unwrap(),
        "true"
    );
}

#[tokio::test]
async fn select_page_renders_html_links() {
    let harness = build_harness().await;
    let req = Request::builder()
        .uri("/oauth2/select")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_string(response).await;
    assert!(body.contains("/oauth2/testidp/login"));
    assert!(body.contains("Testidp"));
}

// ---------------------------------------------------------------------------------------------
// CORS (Story 019)
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn cors_preflight_matching_origin_gets_headers() {
    let harness = build_harness().await;
    let req = Request::builder()
        .method("OPTIONS")
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ORIGIN, "https://allowed.example.com")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .unwrap(),
        "https://allowed.example.com"
    );
    assert_eq!(
        response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
            .unwrap(),
        "true"
    );
}

#[tokio::test]
async fn cors_non_matching_origin_gets_no_headers() {
    let harness = build_harness().await;
    let req = Request::builder()
        .method("OPTIONS")
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(header::ORIGIN, "https://evil.example.com")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.oneshot(req).await.unwrap();
    assert!(response
        .headers()
        .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        .is_none());
}

// ---------------------------------------------------------------------------------------------
// Sanity check that the harness itself doesn't silently no-op (mirrors ref-proxy's own
// "does the state builder actually reach the mock servers" concern).
// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn direct_gate_call_smoke_test() {
    // Exercises the middleware layer function directly (not just through the router) to catch
    // any accidental divergence between `auth_gate` and how `router::apply_auth_gate` wires it.
    let harness = build_harness().await;
    let state_arc = {
        // Re-derive an Arc<PortcullisState> the same way build_harness did, just to prove
        // `from_fn_with_state`-style direct construction also works end to end.
        let oidc = &harness.oidc_server;
        let tower = &harness.tower_server;
        build_state_for(&oidc.uri(), &tower.uri()).await
    };
    let router: Router<Arc<PortcullisState>> = Router::new()
        .route("/health", get(|| async { "ok" }))
        .layer(from_fn_with_state(state_arc.clone(), auth_gate));
    let app = router.with_state(state_arc);

    let req = Request::builder()
        .uri("/health")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
