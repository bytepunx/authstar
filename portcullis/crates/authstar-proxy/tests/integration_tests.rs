//! Behavior-tier tests for the reverse-proxy handler itself (Story 011/012), independent of the
//! auth gate (that's covered in authstar-middleware's own integration tests) — a `ForwardContext`
//! is inserted directly into the request extensions, exactly as the gate would have done.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use authstar_config::bundle::{CookieConfig, TenantJwtConfig, TenantStatus, UpstreamConfig};
use authstar_middleware::api_key_verifier::UnreachableApiKeyVerifier;
use authstar_middleware::context::ForwardContext;
use authstar_middleware::enricher::{ClaimsEnricher, EnrichmentContext, EnrichmentOutcome};
use authstar_middleware::identity_hash::IdentityHashKeys;
use authstar_middleware::keys::EcKeyGenerations;
use authstar_middleware::rate_limit::ApiKeyRateLimiter;
use authstar_middleware::state::{ApplicationRuntime, PortcullisState, TenantRuntime};
use authstar_proxy::proxy::proxy_handler;
use axum::async_trait;
use axum::body::Body;
use axum::extract::connect_info::MockConnectInfo;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use indexmap::IndexMap;
use tower::ServiceExt;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request as WiremockRequest, ResponseTemplate};

struct NeverEnricher;
#[async_trait]
impl ClaimsEnricher for NeverEnricher {
    async fn enrich(&self, _ctx: &EnrichmentContext) -> EnrichmentOutcome {
        EnrichmentOutcome::Unreachable("not used in proxy tests".to_string())
    }
}

fn test_application(base: String, routes: IndexMap<String, String>) -> ApplicationRuntime {
    ApplicationRuntime {
        slug: "app".to_string(),
        hosts: vec!["app.acme.test".to_string()],
        public_url: "http://app.acme.test".to_string(),
        upstream: UpstreamConfig {
            base,
            routes,
            timeout: 2,
        },
        cors: None,
        exempt: vec![],
        login_url: None,
        exposed_providers: vec![],
    }
}

fn test_tenant(application: ApplicationRuntime) -> TenantRuntime {
    let mut applications = IndexMap::new();
    applications.insert("app".to_string(), application);
    TenantRuntime {
        slug: "acme".to_string(),
        status: TenantStatus::Active,
        cookie: CookieConfig {
            domain: "app.acme.test".to_string(),
            path: "/".to_string(),
            max_age: 3600,
            http_only: true,
            secure: false,
        },
        jwt: TenantJwtConfig {
            issuer: "authstar".to_string(),
            audience: "acme".to_string(),
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
    }
}

fn build_state(application: ApplicationRuntime) -> Arc<PortcullisState> {
    let mut tenants = IndexMap::new();
    let mut host_index = IndexMap::new();
    host_index.insert(
        "app.acme.test".to_string(),
        ("acme".to_string(), "app".to_string()),
    );
    tenants.insert("acme".to_string(), test_tenant(application));

    Arc::new(PortcullisState {
        tenants,
        host_index,
        web_upstream: None,
        http_client: reqwest::Client::new(),
        proxy_http_client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap(),
        enricher: Arc::new(NeverEnricher),
        api_key_verifier: Arc::new(UnreachableApiKeyVerifier),
        api_key_rate_limiter: ApiKeyRateLimiter::new(),
        tower_http_client: reqwest::Client::new(),
        tower_base_url: String::new(),
        keep_base_url: String::new(),
    })
}

fn app_with_forward_context(state: Arc<PortcullisState>, internal_token: Option<String>) -> Router {
    let ctx = ForwardContext {
        tenant_slug: "acme".to_string(),
        application_slug: "app".to_string(),
        internal_token,
    };
    let router: Router<Arc<PortcullisState>> = Router::new()
        .fallback(proxy_handler)
        .layer(axum::middleware::from_fn(
            move |mut req: Request<Body>, next: axum::middleware::Next| {
                let ctx = ctx.clone();
                async move {
                    req.extensions_mut().insert(ctx);
                    next.run(req).await
                }
            },
        ))
        .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 0))));
    router.with_state(state)
}

#[tokio::test]
async fn forwards_to_catch_all_base_with_headers() {
    let upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/dashboard"))
        .respond_with(move |req: &WiremockRequest| {
            let has_auth = req.headers.get("authorization").is_some();
            let xff = req.headers.get("x-forwarded-for").is_some();
            let xfh = req
                .headers
                .get("x-forwarded-host")
                .map(|v| v.to_str().unwrap().to_string())
                .unwrap_or_default();
            let xfp = req
                .headers
                .get("x-forwarded-proto")
                .map(|v| v.to_str().unwrap().to_string())
                .unwrap_or_default();
            ResponseTemplate::new(200)
                .set_body_string(format!("auth={has_auth} xff={xff} xfh={xfh} xfp={xfp}"))
        })
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, Some("internal-token-abc".to_string()));

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header(
            header::AUTHORIZATION,
            "Bearer client-supplied-should-be-replaced",
        )
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = http_body_util::BodyExt::collect(response.into_body())
        .await
        .unwrap()
        .to_bytes();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.contains("auth=true"));
    assert!(body_str.contains("xff=true"));
    assert!(body_str.contains("xfh=app.acme.test"));
    // Every real client request reaches portcullis over HTTPS at Cloudflare's
    // own edge (TLS terminates there, not at portcullis) -- "https" is the
    // correct default for this deployment's only real ingress path.
    // Regression: this was previously hardcoded to "http" unconditionally,
    // which broke SvelteKit adapter-node's default CSRF-origin check on the
    // `web` upstream.
    assert!(body_str.contains("xfp=https"));
}

#[tokio::test]
async fn preserves_an_existing_inbound_x_forwarded_proto() {
    let upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/dashboard"))
        .respond_with(move |req: &WiremockRequest| {
            let xfp = req
                .headers
                .get("x-forwarded-proto")
                .map(|v| v.to_str().unwrap().to_string())
                .unwrap_or_default();
            ResponseTemplate::new(200).set_body_string(format!("xfp={xfp}"))
        })
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, Some("internal-token-abc".to_string()));

    let req = Request::builder()
        .uri("/dashboard")
        .header(header::HOST, "app.acme.test")
        .header("x-forwarded-proto", "http")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = http_body_util::BodyExt::collect(response.into_body())
        .await
        .unwrap()
        .to_bytes();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.contains("xfp=http"));
}

#[tokio::test]
async fn no_internal_token_means_no_authorization_header_forwarded() {
    let upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(move |req: &WiremockRequest| {
            let has_auth = req.headers.get("authorization").is_some();
            ResponseTemplate::new(200).set_body_string(format!("auth={has_auth}"))
        })
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .uri("/health")
        .header(header::HOST, "app.acme.test")
        .header(header::AUTHORIZATION, "Bearer client-supplied")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    let body = http_body_util::BodyExt::collect(response.into_body())
        .await
        .unwrap()
        .to_bytes();
    assert_eq!(String::from_utf8(body.to_vec()).unwrap(), "auth=false");
}

#[tokio::test]
async fn prefix_route_strips_matched_prefix() {
    let api_upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/users"))
        .respond_with(ResponseTemplate::new(200).set_body_string("api-service"))
        .mount(&api_upstream)
        .await;

    let base_upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/users"))
        .respond_with(ResponseTemplate::new(200).set_body_string("base-service"))
        .mount(&base_upstream)
        .await;

    let mut routes = IndexMap::new();
    routes.insert("/api".to_string(), api_upstream.uri());
    let application = test_application(base_upstream.uri(), routes);
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .uri("/api/users")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    let body = http_body_util::BodyExt::collect(response.into_body())
        .await
        .unwrap()
        .to_bytes();
    assert_eq!(String::from_utf8(body.to_vec()).unwrap(), "api-service");
}

#[tokio::test]
async fn upstream_unavailable_returns_502() {
    // Bind then immediately drop a listener to get a real connection-refused, matching
    // ref-proxy's own documented reasoning for this exact pattern (some environments silently
    // drop connections instead of refusing them, which would produce a timeout, not a refusal).
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener);

    let application = test_application(format!("http://{addr}"), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .uri("/anything")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn upstream_timeout_returns_504() {
    let upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/slow"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(5)))
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .uri("/slow")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
}

#[tokio::test]
async fn options_method_is_forwarded_like_any_other_when_no_cors_layer_present() {
    // Story 019's OPTIONS-interception is CORS-layer behavior, not the proxy handler's — the
    // proxy handler itself has no special-case for OPTIONS (this test documents that boundary).
    let upstream = MockServer::start().await;
    Mock::given(method("OPTIONS"))
        .and(path("/anything"))
        .respond_with(ResponseTemplate::new(204))
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .method("OPTIONS")
        .uri("/anything")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn passes_a_3xx_from_upstream_straight_through_instead_of_following_it() {
    // Regression: `proxy_handler` used to follow a redirect from upstream (e.g. SvelteKit's own
    // `redirect(303, ...)` after a completed Stripe Checkout session, or any other upstream
    // redirect) itself via reqwest's default redirect policy, re-sending the follow-up request
    // with the *original* upstream's `Host` header override still attached. Against a real
    // cross-origin target (checkout.stripe.com) that produced a Host-header-routed edge (Fastly)
    // rejecting the request outright ("Requested host does not match any SAN") -- the browser
    // never saw the redirect at all. The fix (`PortcullisState::proxy_http_client`, built with
    // `redirect::Policy::none()`) requires the 3xx and its `Location` to reach the browser
    // unchanged, which this test asserts directly against a mock upstream.
    let upstream = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/account"))
        .respond_with(
            ResponseTemplate::new(303).insert_header("location", "https://checkout.stripe.com/c/pay/cs_live_abc123"),
        )
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .method("POST")
        .uri("/account")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response
            .headers()
            .get(header::LOCATION)
            .and_then(|v| v.to_str().ok()),
        Some("https://checkout.stripe.com/c/pay/cs_live_abc123")
    );
}

#[tokio::test]
async fn preserves_every_repeated_response_header_from_upstream() {
    // Regression: `build_response` used to copy upstream headers with `HeaderMap::insert`, which
    // replaces rather than accumulates -- fine for single-valued headers, but it silently dropped
    // all but the last value of a header the upstream legitimately repeats. Set-Cookie is the
    // consequential real-world case: a login response routinely sets more than one cookie.
    let upstream = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/login"))
        .respond_with(ResponseTemplate::new(200).append_headers([
            ("set-cookie", "session=abc123; Path=/"),
            ("set-cookie", "csrf=xyz789; Path=/"),
        ]))
        .mount(&upstream)
        .await;

    let application = test_application(upstream.uri(), IndexMap::new());
    let state = build_state(application);
    let app = app_with_forward_context(state, None);

    let req = Request::builder()
        .method("GET")
        .uri("/login")
        .header(header::HOST, "app.acme.test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    let cookies: Vec<&str> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .collect();
    assert_eq!(
        cookies,
        vec!["session=abc123; Path=/", "csrf=xyz789; Path=/"]
    );
}
