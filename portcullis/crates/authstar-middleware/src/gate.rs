//! The authentication gate (Story 013) — the single enforcement point for every auth/authz
//! decision portcullis makes. Order, exactly as Story 013 specifies:
//!
//! 1. Tenant resolution from `Host`, then **immediately** the tenant status check (Story 013,
//!    ADR 0062) — before anything application-specific is touched.
//! 2. Application resolution from `Host` (within the confirmed-active tenant).
//! 3. Session JWT verification (Story 009).
//! 4. Exempt-route check (Story 003).
//! 5. If a valid session exists: claims enrichment and its three-way outcome (Story 010),
//!    applied uniformly regardless of exemption — enrichment always runs on a valid session, but
//!    only a *protected* route can actually be blocked by `Deny`/fail-closed `Unreachable`
//!    (ADR 0015: an exempt route is never blocked, at worst it's forwarded anonymously).
//! 6. If no valid session and the route is protected: browser vs. API-client branch
//!    (Story 014) decides between a redirect-with-return-cookie (Story 007) and a `401`
//!    (Story 015).

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::context::ForwardContext;
use crate::cookies::{build_cookie, read_cookie_from_headers};
use crate::detect::is_browser_request;
use crate::enricher::{EnrichmentContext, EnrichmentOutcome};
use crate::exempt::is_exempt;
use crate::jwt::internal::{allow_claims, degraded_claims, sign_internal, BaselineIdentity};
use crate::jwt::session::verify_session;
use crate::keys::EcKeyPair;
use crate::return_url::is_safe_return_url;
use crate::state::{ApplicationRuntime, HostResolutionError, PortcullisState, TenantRuntime};

const RETURN_COOKIE_NAME: &str = "authstar-return";
const RETURN_COOKIE_MAX_AGE: u64 = 300;
const SESSION_COOKIE_NAME: &str = "jwt";

pub async fn auth_gate(
    State(state): State<Arc<PortcullisState>>,
    mut req: Request,
    next: Next,
) -> Response {
    let host = match req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
    {
        Some(h) => h.to_string(),
        None => return not_found(),
    };

    let (tenant, application) = match state.resolve_active_host(&host) {
        Ok(pair) => pair,
        Err(HostResolutionError::NotFound) => return not_found(),
        Err(HostResolutionError::Suspended) => return service_unavailable(),
    };

    let path = req.uri().path().to_string();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| path.clone());

    let session = try_verify_session(tenant, req.headers());
    let exempt = is_exempt(&path, &application.exempt);

    if let Some(claims) = session {
        let ctx = EnrichmentContext {
            tenant: tenant.slug.clone(),
            application: application.slug.clone(),
            idp: claims.idp.clone(),
            identity_hash: claims.identity_hash.clone(),
            email: claims.sub.clone(),
        };
        let outcome = state.enricher.enrich(&ctx).await;
        return handle_enrichment_outcome(
            tenant,
            application,
            &claims.sub,
            &claims.idp,
            &claims.identity_hash,
            outcome,
            exempt,
            req,
            next,
        )
        .await;
    }

    if exempt {
        req.extensions_mut().insert(ForwardContext {
            tenant_slug: tenant.slug.clone(),
            application_slug: application.slug.clone(),
            internal_token: None,
        });
        return next.run(req).await;
    }

    // No valid session, route is protected: browser vs. API-client (Story 014/007/015).
    if is_browser_request(req.headers()) {
        redirect_to_login(tenant, application, &path_and_query)
    } else {
        unauthorized_api_response()
    }
}

#[allow(clippy::too_many_arguments)]
async fn handle_enrichment_outcome(
    tenant: &TenantRuntime,
    application: &ApplicationRuntime,
    email: &str,
    idp: &str,
    identity_hash: &str,
    outcome: EnrichmentOutcome,
    exempt: bool,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let identity = BaselineIdentity {
        email,
        idp,
        identity_hash,
    };

    match outcome {
        EnrichmentOutcome::Allow(allow) => {
            let Some(internal_key) = tenant.internal_keys.current() else {
                // Can't sign anything for this tenant — a portcullis-side misconfiguration, not
                // a client-facing category from Story 010/015. Exempt routes still get through
                // (anonymously, matching "never worse off than an anonymous visitor" — ADR
                // 0015), protected routes fail loudly rather than silently forwarding as if
                // unauthenticated.
                return if exempt {
                    forward_without_token(tenant, application, req, next).await
                } else {
                    internal_error()
                };
            };
            let now = now_unix();
            let roles = allow.merged_roles(now);
            let claims = allow_claims(
                identity,
                allow.account_id,
                allow.organization_id,
                roles,
                allow.permissions,
                allow.usage,
                allow.is_new_account,
            );
            match sign_internal(internal_key, &claims, &tenant.slug) {
                Ok(token) => {
                    req.extensions_mut().insert(ForwardContext {
                        tenant_slug: tenant.slug.clone(),
                        application_slug: application.slug.clone(),
                        internal_token: Some(token),
                    });
                    next.run(req).await
                }
                Err(_) => internal_error(),
            }
        }
        EnrichmentOutcome::Deny { status, reason } => {
            tracing::debug!(tenant = %tenant.slug, application = %application.slug, status, reason, "enrichment denied");
            if exempt {
                forward_without_token(tenant, application, req, next).await
            } else {
                deny_response(status)
            }
        }
        EnrichmentOutcome::Unreachable(err) => {
            tracing::debug!(tenant = %tenant.slug, application = %application.slug, error = %err, "enrichment unreachable, failing open");
            // Fail-open is this pass's only implemented policy — see enricher.rs's module doc.
            let Some(internal_key) = tenant.internal_keys.current() else {
                return if exempt {
                    forward_without_token(tenant, application, req, next).await
                } else {
                    internal_error()
                };
            };
            let claims = degraded_claims(identity);
            match sign_internal(internal_key, &claims, &tenant.slug) {
                Ok(token) => {
                    req.extensions_mut().insert(ForwardContext {
                        tenant_slug: tenant.slug.clone(),
                        application_slug: application.slug.clone(),
                        internal_token: Some(token),
                    });
                    next.run(req).await
                }
                Err(_) => internal_error(),
            }
        }
    }
}

async fn forward_without_token(
    tenant: &TenantRuntime,
    application: &ApplicationRuntime,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    req.extensions_mut().insert(ForwardContext {
        tenant_slug: tenant.slug.clone(),
        application_slug: application.slug.clone(),
        internal_token: None,
    });
    next.run(req).await
}

fn try_verify_session(
    tenant: &TenantRuntime,
    headers: &HeaderMap,
) -> Option<crate::jwt::session::SessionClaims> {
    let cookie_value = read_cookie_from_headers(headers, SESSION_COOKIE_NAME)?;
    if tenant.session_keys.is_empty() {
        return None;
    }
    // Every in-window generation (ADR 0088/Story 009's overlap window) -- a cookie signed
    // before a rotation must still verify against the now-retired key until it naturally
    // expires, `kid`-selected among all of them by `verify_session` itself.
    let keys: Vec<&EcKeyPair> = tenant.session_keys.all().map(|k| k.as_ref()).collect();
    match verify_session(
        &cookie_value,
        &keys,
        &tenant.jwt.issuer,
        &tenant.jwt.audience,
    ) {
        Ok(claims) => Some(claims),
        Err(e) => {
            tracing::debug!(tenant = %tenant.slug, error = %e, "session verification failed");
            None
        }
    }
}

fn redirect_to_login(
    tenant: &TenantRuntime,
    application: &ApplicationRuntime,
    return_path: &str,
) -> Response {
    let Some(login_url) = &application.login_url else {
        return not_found();
    };
    if !is_safe_return_url(return_path) {
        // Shouldn't happen (we built this from the request's own URI), but never redirect
        // somewhere unsafe.
        return redirect_response(login_url, None);
    }
    let cookie = build_cookie(
        RETURN_COOKIE_NAME,
        return_path,
        &tenant.cookie.path,
        Some(&tenant.cookie.domain),
        RETURN_COOKIE_MAX_AGE,
        true,
        tenant.cookie.secure,
        cookie::SameSite::Lax,
    );
    redirect_response(login_url, Some(cookie))
}

fn redirect_response(location: &str, set_cookie: Option<String>) -> Response {
    let mut builder = Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location);
    if let Some(cookie) = set_cookie {
        builder = builder.header(header::SET_COOKIE, cookie);
    }
    builder.body(Body::empty()).unwrap().into_response()
}

fn unauthorized_api_response() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::WWW_AUTHENTICATE, "Bearer realm=\"authstar\""),
        ],
        r#"{"error":"Unauthorized"}"#,
    )
        .into_response()
}

fn deny_response(status: u16) -> Response {
    let status_code = StatusCode::from_u16(status).unwrap_or(StatusCode::FORBIDDEN);
    let body = generic_body_for_status(status_code);
    (
        status_code,
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response()
}

fn generic_body_for_status(status: StatusCode) -> &'static str {
    match status {
        StatusCode::UNAUTHORIZED => r#"{"error":"Unauthorized"}"#,
        StatusCode::FORBIDDEN => r#"{"error":"Forbidden"}"#,
        _ => r#"{"error":"request denied"}"#,
    }
}

fn service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"temporarily unavailable"}"#,
    )
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

fn internal_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"internal server error"}"#,
    )
        .into_response()
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
