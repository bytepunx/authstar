//! `POST /_authstar/webhooks/stripe` -- forwards Stripe webhook deliveries to keep's own
//! `/_authstar/webhooks/stripe` route (design/stories/keep/002-stripe-webhook-handling.md).
//! Never gated by [`crate::gate::auth_gate`]: Stripe's own webhook signature is the actual
//! authentication for this route (keep verifies it against `config.webhookSecret`), matching
//! `webhooks.ts`'s own comment on keep's side -- portcullis has no session/OAuth concept to
//! check here, and gating this behind login would make Stripe's own deliveries impossible.
//!
//! keep's route assumes it's reached only via portcullis, which resolves the tenant from `Host`
//! and forwards it as `x-authstar-tenant-slug` (keep's own `webhooks.ts` documents this exact
//! assumption). The raw request body is forwarded byte-for-byte, never parsed/re-serialized --
//! keep's signature verification is computed against the exact bytes Stripe signed, and any
//! re-encoding would invalidate it.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::state::{HostResolutionError, PortcullisState};

const STRIPE_SIGNATURE: &str = "stripe-signature";
const TENANT_SLUG_HEADER: &str = "x-authstar-tenant-slug";

pub async fn stripe_webhook_handler(
    State(state): State<Arc<PortcullisState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return not_found();
    };
    let (tenant, _application) = match state.resolve_active_host(host) {
        Ok(pair) => pair,
        Err(HostResolutionError::NotFound) => return not_found(),
        Err(HostResolutionError::Suspended) => return service_unavailable(),
    };

    let Some(signature) = headers.get(STRIPE_SIGNATURE) else {
        return bad_request();
    };

    if state.keep_base_url.is_empty() {
        return service_unavailable();
    }

    let url = format!(
        "{}/_authstar/webhooks/stripe",
        state.keep_base_url.trim_end_matches('/')
    );
    let result = state
        .http_client
        .post(&url)
        .header(STRIPE_SIGNATURE, signature.as_bytes())
        .header(TENANT_SLUG_HEADER, tenant.slug.as_str())
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await;

    match result {
        Ok(resp) => {
            let status =
                StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let body = resp.bytes().await.unwrap_or_default();
            (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
        }
        Err(_) => (
            StatusCode::BAD_GATEWAY,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"upstream unavailable"}"#,
        )
            .into_response(),
    }
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

fn bad_request() -> Response {
    (
        StatusCode::BAD_REQUEST,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"missing stripe-signature header"}"#,
    )
        .into_response()
}
