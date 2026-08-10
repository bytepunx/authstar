//! OAuth2 login initiation (Story 005). Reused verbatim (well, called from a second route) by
//! Story 024's `/oauth2/{name}/link` — not implemented in this pass (see TESTING.md), but this
//! handler is written so that reuse would just be a second route registration, not a fork.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use url::Url;
use uuid::Uuid;

use crate::cookies::build_cookie;
use crate::state::{HostResolutionError, PortcullisState};

const FLOW_COOKIE_MAX_AGE: u64 = 300;

pub async fn login_handler(
    Path(provider_name): Path<String>,
    State(state): State<Arc<PortcullisState>>,
    headers: HeaderMap,
) -> Response {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return not_found();
    };

    let (tenant, application) = match state.resolve_active_host(host) {
        Ok(pair) => pair,
        Err(HostResolutionError::NotFound) => return not_found(),
        Err(HostResolutionError::Suspended) => return service_unavailable(),
    };

    let Some(exposed) = application
        .exposed_providers
        .iter()
        .find(|p| p.name == provider_name && p.working)
    else {
        return not_found();
    };

    let Some(Ok(resolved_provider)) = tenant.resolved_providers.get(&provider_name) else {
        return not_found();
    };

    let code_verifier = generate_pkce_verifier();
    let code_challenge = pkce_challenge(&code_verifier);
    let csrf_state = Uuid::new_v4().to_string();

    let redirect_uri = format!(
        "{}{}",
        application.public_url.trim_end_matches('/'),
        exposed.callback_path
    );

    let auth_url = match build_authorization_url(
        &resolved_provider.authorization_endpoint,
        &resolved_provider.client_id,
        &redirect_uri,
        &resolved_provider.scope,
        &csrf_state,
        &code_challenge,
    ) {
        Ok(url) => url,
        Err(_) => return internal_error(),
    };

    let state_cookie = build_cookie(
        "oauth2-state",
        &csrf_state,
        &tenant.cookie.path,
        Some(&tenant.cookie.domain),
        FLOW_COOKIE_MAX_AGE,
        true,
        tenant.cookie.secure,
        cookie::SameSite::Lax,
    );
    let verifier_cookie = build_cookie(
        "oauth2-pkce-verifier",
        &code_verifier,
        &tenant.cookie.path,
        Some(&tenant.cookie.domain),
        FLOW_COOKIE_MAX_AGE,
        true,
        tenant.cookie.secure,
        cookie::SameSite::Lax,
    );

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, auth_url)
        .header(header::SET_COOKIE, state_cookie)
        .header(header::SET_COOKIE, verifier_cookie)
        .body(Body::empty())
        .unwrap()
        .into_response()
}

fn generate_pkce_verifier() -> String {
    let mut bytes = [0u8; 64];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn build_authorization_url(
    endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scope: &[String],
    csrf_state: &str,
    code_challenge: &str,
) -> Result<String, url::ParseError> {
    let mut url = Url::parse(endpoint)?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &scope.join(" "))
        .append_pair("state", csrf_state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(url.to_string())
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

fn internal_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"internal server error"}"#,
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_deterministic_s256() {
        // RFC 7636 Appendix B test vector.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = pkce_challenge(verifier);
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn verifier_has_no_padding() {
        let verifier = generate_pkce_verifier();
        assert!(!verifier.contains('='));
    }
}
