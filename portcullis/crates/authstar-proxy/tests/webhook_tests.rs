//! Behavior-tier tests for `POST /_authstar/webhooks/stripe` (design/stories/keep/002), the
//! forwarding handler that relays Stripe webhook deliveries to keep -- see
//! `authstar-middleware/src/webhooks.rs`'s own header comment for the design.

use std::sync::Arc;

use authstar_config::bundle::{CookieConfig, TenantJwtConfig, TenantStatus, UpstreamConfig};
use authstar_middleware::enricher::{ClaimsEnricher, EnrichmentContext, EnrichmentOutcome};
use authstar_middleware::identity_hash::IdentityHashKeys;
use authstar_middleware::keys::EcKeyGenerations;
use authstar_middleware::router::webhook_routes;
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
        EnrichmentOutcome::Unreachable("not used in webhook tests".to_string())
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
        enricher: Arc::new(NeverEnricher),
        tower_http_client: reqwest::Client::new(),
        tower_base_url: String::new(),
        keep_base_url,
    })
}

fn app(state: Arc<PortcullisState>) -> Router {
    webhook_routes().with_state(state)
}

#[tokio::test]
async fn forwards_raw_body_and_tenant_slug_and_signature_to_keep() {
    let keep = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/_authstar/webhooks/stripe"))
        .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"received":true}"#))
        .mount(&keep)
        .await;

    let state = test_state(keep.uri());
    let app = app(state);

    let raw_body = r#"{"id":"evt_123","type":"checkout.session.completed"}"#;
    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "loci.bytepunx.test")
        .header("stripe-signature", "t=1,v1=abc")
        .body(Body::from(raw_body))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(body.as_ref(), br#"{"received":true}"#);

    // Assert on the captured request directly rather than through a wiremock header
    // matcher precondition -- wiremock's `header()` matcher splits comma-containing
    // values (treating them as a multi-value list per RFC 7230 3.2.2), which mismatches
    // Stripe's own `t=...,v1=...` signature format even when the value is forwarded
    // byte-for-byte correctly (confirmed directly against the received request).
    let received = keep.received_requests().await.unwrap();
    assert_eq!(received.len(), 1);
    let received_req = &received[0];
    assert_eq!(
        received_req.headers.get("stripe-signature").unwrap(),
        "t=1,v1=abc"
    );
    assert_eq!(
        received_req.headers.get("x-authstar-tenant-slug").unwrap(),
        "bytepunx"
    );
    assert_eq!(received_req.body, raw_body.as_bytes());
}

#[tokio::test]
async fn relays_keeps_error_status_verbatim() {
    let keep = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/_authstar/webhooks/stripe"))
        .respond_with(ResponseTemplate::new(400).set_body_string(r#"{"error":"bad signature"}"#))
        .mount(&keep)
        .await;

    let state = test_state(keep.uri());
    let app = app(state);

    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "loci.bytepunx.test")
        .header("stripe-signature", "t=1,v1=bad")
        .body(Body::from("{}"))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn missing_stripe_signature_header_is_400_without_calling_keep() {
    let keep = MockServer::start().await;
    // No Mock registered -- an unexpected call would fail the request (wiremock's default
    // behavior for an unmatched request), proving keep is never reached.

    let state = test_state(keep.uri());
    let app = app(state);

    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "loci.bytepunx.test")
        .body(Body::from("{}"))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unknown_host_is_404() {
    let state = test_state(String::new());
    let app = app(state);

    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "nope.invalid")
        .header("stripe-signature", "t=1,v1=abc")
        .body(Body::from("{}"))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn no_keep_upstream_configured_is_503() {
    let state = test_state(String::new());
    let app = app(state);

    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "loci.bytepunx.test")
        .header("stripe-signature", "t=1,v1=abc")
        .body(Body::from("{}"))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn keep_unreachable_is_502() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener);

    let state = test_state(format!("http://{addr}"));
    let app = app(state);

    let req = Request::builder()
        .method("POST")
        .uri("/_authstar/webhooks/stripe")
        .header(header::HOST, "loci.bytepunx.test")
        .header("stripe-signature", "t=1,v1=abc")
        .body(Body::from("{}"))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
}
