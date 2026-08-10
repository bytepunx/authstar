//! `GET /oauth2/select` (Story 018) — the built-in fallback picker page. In production this
//! path is normally proxied to `web` for tenant-branded rendering first (Story 023, not
//! implemented in this pass — see TESTING.md); this handler is what Story 018 itself describes
//! and is registered unconditionally so the fallback exists even without `web` wired up.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};

use crate::state::{HostResolutionError, PortcullisState};

pub async fn select_handler(
    State(state): State<Arc<PortcullisState>>,
    headers: HeaderMap,
) -> Response {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return not_found();
    };
    let (_tenant, application) = match state.resolve_active_host(host) {
        Ok(pair) => pair,
        Err(HostResolutionError::NotFound) => return not_found(),
        Err(HostResolutionError::Suspended) => return service_unavailable(),
    };

    let links: String = application
        .working_providers()
        .map(|p| {
            format!(
                "<li><a href=\"{}\">{}</a></li>",
                escape_html(&p.login_path),
                escape_html(&capitalize(&p.name))
            )
        })
        .collect();

    let body = format!(
        "<!doctype html><html><head><title>Sign in</title></head><body><ul>{links}</ul></body></html>"
    );

    Html(body).into_response()
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
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
