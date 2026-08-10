//! `GET /oauth2/providers` (Story 017).

use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::state::{HostResolutionError, PortcullisState};

#[derive(Serialize)]
struct ProviderEntry {
    id: String,
    name: String,
    #[serde(rename = "loginUrl")]
    login_url: String,
}

pub async fn providers_handler(
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

    let entries: Vec<ProviderEntry> = application
        .working_providers()
        .map(|p| ProviderEntry {
            id: p.name.clone(),
            name: capitalize(&p.name),
            login_url: p.login_path.clone(),
        })
        .collect();

    Json(entries).into_response()
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capitalizes_first_letter_only() {
        assert_eq!(capitalize("google"), "Google");
        assert_eq!(capitalize("testidp"), "Testidp");
    }
}
