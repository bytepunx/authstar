pub mod routing;

use std::time::Duration;

use authstar_middleware::context::ForwardContext;
use authstar_middleware::state::PortcullisState;
use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;
use std::sync::Arc;

use routing::RouteResolver;

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
    "proxy-authenticate",
    "te",
    "trailers",
];

/// The reverse-proxy fallback handler (Story 011/012). Sits behind the auth gate — expects a
/// [`ForwardContext`] to already be present in request extensions (the gate always inserts one
/// on any request it forwards, per `gate.rs`).
///
/// **Deferred**: Story 011a (WebSocket upgrade passthrough) is not implemented in this pass —
/// see TESTING.md. A `Connection: Upgrade` request reaching this handler is forwarded as a plain
/// buffered HTTP request like any other, which will fail against an upstream expecting a real
/// `101 Switching Protocols` handshake; it does not crash portcullis itself.
pub async fn proxy_handler(
    State(state): State<Arc<PortcullisState>>,
    ConnectInfo(client_addr): ConnectInfo<SocketAddr>,
    req: Request,
) -> Response {
    let Some(ctx) = req.extensions().get::<ForwardContext>().cloned() else {
        return internal_error();
    };
    let Some(tenant) = state.tenants.get(&ctx.tenant_slug) else {
        return internal_error();
    };
    let Some(application) = tenant.applications.get(&ctx.application_slug) else {
        return internal_error();
    };

    let resolver = RouteResolver::new(
        &application.upstream.routes,
        application.upstream.base.clone(),
    );
    let (upstream_base, forwarded_path) = resolver.resolve(req.uri().path());

    let inbound_host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();

    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let upstream_url = format!(
        "{}{}{}",
        upstream_base.trim_end_matches('/'),
        forwarded_path,
        query
    );

    let method = req.method().clone();
    let mut headers = build_forwarded_headers(
        req.headers(),
        &ctx,
        &upstream_url,
        &inbound_host,
        client_addr,
    );

    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return internal_error(),
    };

    let upstream_uri: Uri = match upstream_url.parse() {
        Ok(u) => u,
        Err(_) => return internal_error(),
    };
    if let Some(authority) = upstream_uri.authority() {
        if let Ok(value) = HeaderValue::from_str(authority.as_str()) {
            headers.insert(header::HOST, value);
        }
    }

    let reqwest_method = match reqwest::Method::from_bytes(method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return internal_error(),
    };
    let mut reqwest_headers = reqwest::header::HeaderMap::new();
    for (name, value) in headers.iter() {
        if let (Ok(n), Ok(v)) = (
            reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes()),
            reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            reqwest_headers.insert(n, v);
        }
    }

    let timeout = Duration::from_secs(application.upstream.timeout);
    let result = state
        .proxy_http_client
        .request(reqwest_method, &upstream_url)
        .headers(reqwest_headers)
        .body(body_bytes)
        .timeout(timeout)
        .send()
        .await;

    match result {
        Ok(resp) => build_response(resp).await,
        Err(e) if e.is_timeout() => (
            StatusCode::GATEWAY_TIMEOUT,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"upstream timeout"}"#,
        )
            .into_response(),
        Err(_) => (
            StatusCode::BAD_GATEWAY,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"upstream unavailable"}"#,
        )
            .into_response(),
    }
}

fn build_forwarded_headers(
    inbound: &HeaderMap,
    ctx: &ForwardContext,
    _upstream_url: &str,
    inbound_host: &str,
    client_addr: SocketAddr,
) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in inbound.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) || lower == "authorization" || lower == "host" {
            continue;
        }
        headers.insert(name.clone(), value.clone());
    }

    match &ctx.internal_token {
        Some(token) => {
            if let Ok(value) = HeaderValue::from_str(&format!("Bearer {token}")) {
                headers.insert(header::AUTHORIZATION, value);
            }
        }
        None => {
            headers.remove(header::AUTHORIZATION);
        }
    }

    append_forwarded_for(&mut headers, client_addr.ip().to_string());
    // Preserve whatever the edge in front of us already reported (Cloudflare
    // sets this on every request that reaches cloudflared) rather than
    // overwriting it -- this was previously hardcoded to "http"
    // unconditionally, which was simply wrong: every real client request
    // reaches us over HTTPS at Cloudflare's own edge (TLS terminates there,
    // not at portcullis), so telling upstream "http" made every
    // upstream-side origin/scheme check (e.g. SvelteKit adapter-node's
    // default CSRF-origin check) see a scheme that never matched what the
    // browser actually used. "https" is the correct fallback for this
    // deployment's only real ingress path; a value already present from the
    // edge takes precedence if for some reason one exists.
    if !headers.contains_key(HeaderName::from_static("x-forwarded-proto")) {
        headers.insert(
            HeaderName::from_static("x-forwarded-proto"),
            HeaderValue::from_static("https"),
        );
    }
    if let Ok(value) = HeaderValue::from_str(inbound_host) {
        headers.insert(HeaderName::from_static("x-forwarded-host"), value);
    }

    headers
}

fn append_forwarded_for(headers: &mut HeaderMap, client_ip: String) {
    let name = HeaderName::from_static("x-forwarded-for");
    let combined = match headers.get(&name).and_then(|v| v.to_str().ok()) {
        Some(existing) => format!("{existing}, {client_ip}"),
        None => client_ip,
    };
    if let Ok(value) = HeaderValue::from_str(&combined) {
        headers.insert(name, value);
    }
}

async fn build_response(resp: reqwest::Response) -> Response {
    let status = resp.status();
    let mut headers = HeaderMap::new();
    for (name, value) in resp.headers().iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            axum::http::HeaderName::from_bytes(name.as_str().as_bytes()),
            axum::http::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            headers.insert(n, v);
        }
    }

    let body = match resp.bytes().await {
        Ok(b) => b,
        Err(_) => Bytes::new(),
    };

    let mut builder = Response::builder().status(
        axum::http::StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
    );
    if let Some(h) = builder.headers_mut() {
        *h = headers;
    }
    builder.body(Body::from(body)).unwrap()
}

fn internal_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"internal server error"}"#,
    )
        .into_response()
}
