//! `/_authstar/me/subscription` (ADR 0071): the gated forward to keep. The gate itself is
//! covered by the gate tests; here the handler is exercised directly with the
//! `ForwardContext` the gate would have inserted, against a wiremock keep.

use std::sync::Arc;

use authstar_config::bundle::{CookieConfig, TenantJwtConfig, TenantStatus, UpstreamConfig};
use authstar_middleware::api_key_verifier::UnreachableApiKeyVerifier;
use authstar_middleware::context::ForwardContext;
use authstar_middleware::enricher::{ClaimsEnricher, EnrichmentContext, EnrichmentOutcome};
use authstar_middleware::identity_hash::IdentityHashKeys;
use authstar_middleware::keys::EcKeyGenerations;
use authstar_middleware::rate_limit::ApiKeyRateLimiter;
use authstar_middleware::router::me_routes;
use authstar_middleware::state::{ApplicationRuntime, PortcullisState, TenantRuntime};
use axum::async_trait;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use indexmap::IndexMap;
use tower::ServiceExt;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

struct NeverEnricher;
#[async_trait]
impl ClaimsEnricher for NeverEnricher {
    async fn enrich(&self, _ctx: &EnrichmentContext) -> EnrichmentOutcome {
        EnrichmentOutcome::Unreachable("not used in me tests".to_string())
    }
}

fn test_state(keep_base_url: String) -> Arc<PortcullisState> {
    let application = ApplicationRuntime {
        slug: "loci".to_string(),
        hosts: vec!["loci.bytepunx.test".to_string()],
        public_url: "https://loci.bytepunx.test".to_string(),
        upstream: UpstreamConfig {
            base: "http://upstream.invalid".to_string(),
            routes: IndexMap::new(),
            timeout: 2,
        },
        cors: None,
        exempt: vec![],
        login_url: None,
        exposed_providers: vec![],
    };
    let mut applications = IndexMap::new();
    applications.insert("loci".to_string(), application);
    let tenant = TenantRuntime {
        slug: "bytepunx".to_string(),
        status: TenantStatus::Active,
        cookie: CookieConfig {
            domain: ".bytepunx.test".to_string(),
            path: "/".to_string(),
            max_age: 604800,
            http_only: true,
            secure: true,
        },
        jwt: TenantJwtConfig {
            issuer: "authstar".to_string(),
            audience: "bytepunx".to_string(),
            expires_in: "168h".to_string(),
        },
        branding: None,
        session_keys: EcKeyGenerations::new(vec![]),
        internal_keys: EcKeyGenerations::new(vec![]),
        identity_hash_keys: IdentityHashKeys::new(vec![]),
        providers: IndexMap::new(),
        provider_client_secrets: IndexMap::new(),
        resolved_providers: IndexMap::new(),
        applications,
    };
    let mut tenants = IndexMap::new();
    let mut host_index = IndexMap::new();
    host_index.insert(
        "loci.bytepunx.test".to_string(),
        ("bytepunx".to_string(), "loci".to_string()),
    );
    tenants.insert("bytepunx".to_string(), tenant);
    Arc::new(PortcullisState {
        tenants,
        host_index,
        web_upstream: None,
        http_client: reqwest::Client::new(),
        proxy_http_client: reqwest::Client::new(),
        enricher: Arc::new(NeverEnricher),
        api_key_verifier: Arc::new(UnreachableApiKeyVerifier),
        api_key_rate_limiter: ApiKeyRateLimiter::new(),
        tower_http_client: reqwest::Client::new(),
        tower_base_url: String::new(),
        keep_base_url,
    })
}

fn app(state: Arc<PortcullisState>) -> Router {
    me_routes().with_state(state)
}

fn request(token: Option<&str>) -> Request<Body> {
    let mut req = Request::builder()
        .method("GET")
        .uri("/_authstar/me/subscription")
        .header(header::HOST, "loci.bytepunx.test")
        .body(Body::empty())
        .unwrap();
    req.extensions_mut().insert(ForwardContext {
        tenant_slug: "bytepunx".to_string(),
        application_slug: "loci".to_string(),
        internal_token: token.map(str::to_string),
    });
    req
}

#[tokio::test]
async fn forwards_the_internal_token_as_a_bearer_and_relays_keeps_body() {
    let keep = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/me/subscription"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"{"status":"active","planName":"Pro","currentPeriodEnd":"2026-12-01T00:00:00.000Z"}"#,
        ))
        .mount(&keep)
        .await;

    let response = app(test_state(keep.uri()))
        .oneshot(request(Some("ey.internal.token")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(
        body.as_ref(),
        br#"{"status":"active","planName":"Pro","currentPeriodEnd":"2026-12-01T00:00:00.000Z"}"#
    );

    let received = keep.received_requests().await.unwrap();
    assert_eq!(received.len(), 1);
    assert_eq!(
        received[0].headers.get("authorization").unwrap(),
        "Bearer ey.internal.token"
    );
}

#[tokio::test]
async fn relays_keeps_error_status() {
    let keep = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/me/subscription"))
        .respond_with(ResponseTemplate::new(403).set_body_string(r#"{"error":"forbidden"}"#))
        .mount(&keep)
        .await;

    let response = app(test_state(keep.uri()))
        .oneshot(request(Some("t")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn is_unauthorized_when_the_gate_minted_no_token() {
    let keep = MockServer::start().await;
    let response = app(test_state(keep.uri()))
        .oneshot(request(None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(keep.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn is_service_unavailable_without_a_keep_upstream() {
    let response = app(test_state(String::new()))
        .oneshot(request(Some("t")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn is_bad_gateway_when_keep_is_unreachable() {
    let response = app(test_state("http://127.0.0.1:9".to_string()))
        .oneshot(request(Some("t")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
}
