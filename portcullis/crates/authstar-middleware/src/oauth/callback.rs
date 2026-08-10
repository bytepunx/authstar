//! OAuth2 callback: code exchange, userinfo fetch, identity hash + resolution, session issuance
//! (Story 006). Identity linking (Story 024's `oauth2-link-mode` branch) is not implemented in
//! this pass — see `TESTING.md` — so this handler only ever runs the "ordinary login" path.

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::cookies::{build_cookie, expired_cookie, read_cookie_from_headers};
use crate::identities::resolve_identity;
use crate::jwt::session::{sign_session, SignSessionParams};
use crate::return_url::is_safe_return_url;
use crate::state::{HostResolutionError, PortcullisState};

const TOKEN_USERINFO_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Deserialize)]
pub struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
}

#[derive(Serialize)]
struct TokenRequestForm<'a> {
    grant_type: &'a str,
    code: &'a str,
    redirect_uri: &'a str,
    client_id: &'a str,
    client_secret: &'a str,
    code_verifier: &'a str,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize, Default)]
struct UserinfoResponse {
    email: Option<String>,
    sub: Option<String>,
}

pub async fn callback_handler(
    Path(provider_name): Path<String>,
    State(state): State<Arc<PortcullisState>>,
    Query(params): Query<CallbackParams>,
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
    let Some(client_secret) = tenant.provider_client_secrets.get(&provider_name) else {
        return not_found();
    };

    // These two flow cookies are always cleared, regardless of outcome — collected here and
    // attached to whatever response we end up building.
    let mut expiring_cookies = vec![
        expired_cookie(
            "oauth2-state",
            &tenant.cookie.path,
            Some(&tenant.cookie.domain),
        ),
        expired_cookie(
            "oauth2-pkce-verifier",
            &tenant.cookie.path,
            Some(&tenant.cookie.domain),
        ),
    ];

    let cookie_state = read_cookie_from_headers(&headers, "oauth2-state");
    let state_matches = matches!((&cookie_state, &params.state), (Some(c), Some(q)) if c == q);
    if !state_matches {
        return bad_request_with_cookies("state mismatch or missing", expiring_cookies);
    }

    let Some(code_verifier) = read_cookie_from_headers(&headers, "oauth2-pkce-verifier") else {
        return bad_request_with_cookies("missing PKCE verifier cookie", expiring_cookies);
    };

    let Some(code) = params.code else {
        return bad_request_with_cookies("missing authorization code", expiring_cookies);
    };

    let redirect_uri = format!(
        "{}{}",
        application.public_url.trim_end_matches('/'),
        exposed.callback_path
    );

    let token_response = state
        .http_client
        .post(&resolved_provider.token_endpoint)
        .timeout(TOKEN_USERINFO_TIMEOUT)
        .form(&TokenRequestForm {
            grant_type: "authorization_code",
            code: &code,
            redirect_uri: &redirect_uri,
            client_id: &resolved_provider.client_id,
            client_secret,
            code_verifier: &code_verifier,
        })
        .send()
        .await;

    let token_response = match token_response {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            tracing::error!(status = %r.status(), "token exchange returned non-2xx");
            return internal_error_with_cookies(expiring_cookies);
        }
        Err(e) => {
            tracing::error!(error = %e, "token exchange request failed");
            return internal_error_with_cookies(expiring_cookies);
        }
    };

    let token: TokenResponse = match token_response.json().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "malformed token response");
            return internal_error_with_cookies(expiring_cookies);
        }
    };

    let userinfo_response = state
        .http_client
        .get(&resolved_provider.userinfo_endpoint)
        .bearer_auth(&token.access_token)
        .timeout(TOKEN_USERINFO_TIMEOUT)
        .send()
        .await;

    let userinfo: UserinfoResponse = match userinfo_response {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or_default(),
        Ok(r) => {
            tracing::error!(status = %r.status(), "userinfo request returned non-2xx");
            return internal_error_with_cookies(expiring_cookies);
        }
        Err(e) => {
            tracing::error!(error = %e, "userinfo request failed");
            return internal_error_with_cookies(expiring_cookies);
        }
    };

    let (Some(email), Some(sub)) = (userinfo.email, userinfo.sub) else {
        tracing::error!("userinfo response missing email and/or sub");
        return internal_error_with_cookies(expiring_cookies);
    };

    if tenant.identity_hash_keys.is_empty() {
        tracing::error!(tenant = %tenant.slug, "no identity hash key configured");
        return internal_error_with_cookies(expiring_cookies);
    }
    let candidate_hashes =
        tenant
            .identity_hash_keys
            .all_candidate_hashes(&tenant.slug, &provider_name, &sub);
    // `sub` (the raw provider subject id) is never retained beyond this point: only the hashes
    // computed from it flow onward (ADR 0027).
    drop(sub);

    let resolution = match resolve_identity(
        &state.tower_http_client,
        &state.tower_base_url,
        &tenant.slug,
        &provider_name,
        &candidate_hashes,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(error = %e, "identity resolution failed");
            return internal_error_with_cookies(expiring_cookies);
        }
    };

    // `all_candidate_hashes` returns current-generation-first (see identity_hash.rs), so the
    // first entry is exactly "the hash under the current generation" Story 006 says every
    // issued session always carries, regardless of which candidate tower actually matched.
    let Some(current_hash) = candidate_hashes.first().cloned() else {
        return internal_error_with_cookies(expiring_cookies);
    };

    if resolution.is_new_account {
        tracing::info!(tenant = %tenant.slug, application = %application.slug, "signup completed (analytics dispatch deferred, see TESTING.md)");
    }

    let Some(session_key) = &tenant.session_keys else {
        tracing::error!(tenant = %tenant.slug, "no session signing key configured");
        return internal_error_with_cookies(expiring_cookies);
    };

    let session_token = match sign_session(
        session_key,
        SignSessionParams {
            email: &email,
            idp: &provider_name,
            identity_hash: &current_hash,
            issuer: &tenant.jwt.issuer,
            audience: &tenant.jwt.audience,
            expires_in: &tenant.jwt.expires_in,
        },
    ) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "failed to sign session JWT");
            return internal_error_with_cookies(expiring_cookies);
        }
    };

    let session_cookie = build_cookie(
        "jwt",
        &session_token,
        &tenant.cookie.path,
        Some(&tenant.cookie.domain),
        tenant.cookie.max_age,
        tenant.cookie.http_only,
        tenant.cookie.secure,
        cookie::SameSite::Lax,
    );

    let return_path = read_cookie_from_headers(&headers, "authstar-return");
    expiring_cookies.push(expired_cookie(
        "authstar-return",
        &tenant.cookie.path,
        Some(&tenant.cookie.domain),
    ));
    let redirect_to = match &return_path {
        Some(p) if is_safe_return_url(p) => p.as_str(),
        _ => "/",
    };

    let mut builder = Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, redirect_to)
        .header(header::SET_COOKIE, session_cookie);
    for cookie in expiring_cookies {
        builder = builder.header(header::SET_COOKIE, cookie);
    }
    builder.body(Body::empty()).unwrap().into_response()
}

fn bad_request_with_cookies(message: &str, cookies: Vec<String>) -> Response {
    tracing::debug!(message, "oauth2 callback bad request");
    let mut builder = Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .header(header::CONTENT_TYPE, "application/json");
    for cookie in cookies {
        builder = builder.header(header::SET_COOKIE, cookie);
    }
    builder
        .body(Body::from(r#"{"error":"bad request"}"#))
        .unwrap()
        .into_response()
}

fn internal_error_with_cookies(cookies: Vec<String>) -> Response {
    let mut builder = Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .header(header::CONTENT_TYPE, "application/json");
    for cookie in cookies {
        builder = builder.header(header::SET_COOKIE, cookie);
    }
    builder
        .body(Body::from(r#"{"error":"internal server error"}"#))
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

fn service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"temporarily unavailable"}"#,
    )
        .into_response()
}
