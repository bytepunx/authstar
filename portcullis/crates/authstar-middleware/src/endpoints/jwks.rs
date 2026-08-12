//! `GET /.well-known/jwks.json` (ADR 0086/0087) — the tenant's internal-token public key(s),
//! resolved by `Host` the same as every other local route. Unauthenticated by construction: a
//! JWKS endpoint that itself required a valid token to reach would be circular. Only the
//! internal-token key is ever published here (ADR 0086) — the session key is never
//! independently re-verified by anything but portcullis itself.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::state::{HostResolutionError, PortcullisState};

#[derive(Serialize)]
struct JwksResponse {
    keys: Vec<crate::keys::Jwk>,
}

pub async fn jwks_handler(
    State(state): State<Arc<PortcullisState>>,
    headers: HeaderMap,
) -> Response {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return not_found();
    };
    let (tenant, _application) = match state.resolve_active_host(host) {
        Ok(pair) => pair,
        Err(HostResolutionError::NotFound) => return not_found(),
        Err(HostResolutionError::Suspended) => return service_unavailable(),
    };

    // No internal key configured for this tenant is a portcullis-side misconfiguration
    // (matching gate.rs's own handling of the same condition) -- an empty `keys` array would
    // silently look like "this tenant has no signing key at all" to a JWKS consumer rather than
    // "something is wrong," so this is a 503, not a 200 with nothing in it.
    if tenant.internal_keys.is_empty() {
        return service_unavailable();
    }

    // Every in-window generation (ADR 0088), not just the current one -- a token signed just
    // before a rotation can still be outstanding, and its verifier needs the old key's entry to
    // still be here until it naturally expires.
    Json(JwksResponse {
        keys: tenant.internal_keys.all().map(|key| key.to_jwk()).collect(),
    })
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

fn service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"temporarily unavailable"}"#,
    )
        .into_response()
}
