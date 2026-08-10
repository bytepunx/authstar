//! Logout (Story 016): clears the `jwt` cookie and redirects to `/`. No server-side session
//! state to invalidate (JWTs stay stateless) — a compromised token remains valid until natural
//! expiry or a `Deny` from tower catches it, an accepted trade-off per ADR 0001/0003.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::cookies::expired_cookie;
use crate::state::PortcullisState;

pub async fn logout_handler(
    State(state): State<Arc<PortcullisState>>,
    headers: HeaderMap,
) -> Response {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return not_found();
    };
    // Accessible without authentication and even with an invalid/expired JWT — works purely off
    // the resolved tenant's cookie path/domain, not off any claim.
    let Some((tenant, _application)) = state.resolve_host(host) else {
        return not_found();
    };

    let cookie = expired_cookie("jwt", &tenant.cookie.path, Some(&tenant.cookie.domain));

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, "/")
        .header(header::SET_COOKIE, cookie)
        .body(Body::empty())
        .unwrap()
        .into_response()
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"not found"}"#,
    )
        .into_response()
}
