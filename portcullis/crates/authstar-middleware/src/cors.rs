//! CORS (Story 019). `OPTIONS` requests are handled locally (never forwarded upstream);
//! non-preflight requests get CORS headers added to the response if their `Origin` matches the
//! resolved application's configured origin(s).

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::state::PortcullisState;

const ALLOWED_METHODS: &str = "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS";
const ALLOWED_HEADERS: &str = "Content-Type, Authorization";
const MAX_AGE: &str = "86400";

pub async fn cors_layer(
    State(state): State<Arc<PortcullisState>>,
    req: Request,
    next: Next,
) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let origin = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let matched_origin = host
        .as_deref()
        .and_then(|h| state.resolve_host(h))
        .and_then(|(_, app)| app.cors.as_ref())
        .zip(origin.as_deref())
        .and_then(|(cors, origin)| {
            if cors.origin.matches(origin) {
                Some(origin.to_string())
            } else {
                None
            }
        });

    if req.method() == Method::OPTIONS {
        let mut response = StatusCode::NO_CONTENT.into_response();
        if let Some(origin) = matched_origin {
            add_cors_headers(response.headers_mut(), &origin);
        }
        return response;
    }

    let mut response = next.run(req).await;
    if let Some(origin) = matched_origin {
        add_cors_headers(response.headers_mut(), &origin);
    }
    response
}

fn add_cors_headers(headers: &mut axum::http::HeaderMap, origin: &str) {
    if let Ok(value) = HeaderValue::from_str(origin) {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
    }
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
        HeaderValue::from_static("true"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static(ALLOWED_METHODS),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static(ALLOWED_HEADERS),
    );
    headers.insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static(MAX_AGE),
    );
}
