//! `GET /_authstar/me/subscription` -- the first of the `/_authstar/me/*` self-service family
//! (ADR 0071): same-origin, gated like any protected route, forwarded by prefix to the backend
//! that owns the data. This one is keep's `GET /me/subscription`
//! (design/stories/keep/006-self-service-subscription-stripe-config-and-activity.md).
//!
//! Unlike [`crate::webhooks`], this route runs *inside* [`crate::gate::auth_gate`]: the gate
//! resolves the tenant, requires a session, and hands down a [`ForwardContext`] whose
//! `internal_token` is the ES256 internal JWT keep verifies. No token (an anonymous request on
//! an exempt route, or a fail-closed outcome) is a 401 here, never an anonymous forward: keep's
//! route has no meaning without a caller. Keep is reached over the plain `http_client`, as ADR
//! 0095 chose for webhook forwarding; the SPIFFE mTLS client is tower-only today.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::context::ForwardContext;
use crate::state::PortcullisState;

/// Keep's path for the caller's own subscription.
pub const KEEP_ME_SUBSCRIPTION_PATH: &str = "/me/subscription";

pub async fn me_subscription_handler(
    State(state): State<Arc<PortcullisState>>,
    req: Request<axum::body::Body>,
) -> Response {
    let Some(ctx) = req.extensions().get::<ForwardContext>() else {
        return json(StatusCode::INTERNAL_SERVER_ERROR, r#"{"error":"no forward context"}"#);
    };
    let Some(token) = ctx.internal_token.as_deref() else {
        return json(StatusCode::UNAUTHORIZED, r#"{"error":"login required"}"#);
    };
    if state.keep_base_url.is_empty() {
        return json(StatusCode::SERVICE_UNAVAILABLE, r#"{"error":"billing unavailable"}"#);
    }

    let url = format!(
        "{}{}",
        state.keep_base_url.trim_end_matches('/'),
        KEEP_ME_SUBSCRIPTION_PATH
    );
    let result = state
        .http_client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::ACCEPT, "application/json")
        .send()
        .await;

    match result {
        Ok(resp) => {
            let status =
                StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let body = resp.bytes().await.unwrap_or_default();
            (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
        }
        Err(_) => json(StatusCode::BAD_GATEWAY, r#"{"error":"upstream unavailable"}"#),
    }
}

fn json(status: StatusCode, body: &'static str) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}
