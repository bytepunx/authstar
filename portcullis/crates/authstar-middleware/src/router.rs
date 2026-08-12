//! Assembles the local `/oauth2/*` routes and the auth-gate/CORS layers into pieces a consuming
//! binary (authstar-proxy) can compose with its own proxy fallback. Mirrors ref-proxy's
//! `AuthMiddleware` facade: `oauth_routes()` for the unguarded local routes, `apply_auth_gate`/
//! `apply_cors` for the two middleware layers, applied in the same order ref-proxy settled on
//! (CORS outermost, gate only around the protected/proxied fallback — see authstar-proxy's
//! `main.rs` for the actual composition).

use std::sync::Arc;

use axum::middleware::from_fn_with_state;
use axum::routing::get;
use axum::Router;

use crate::cors::cors_layer;
use crate::endpoints::{jwks_handler, providers_handler, select_handler};
use crate::gate::auth_gate;
use crate::oauth::{callback_handler, login_handler, logout_handler};
use crate::state::PortcullisState;

/// The local, never-proxied `/oauth2/*` routes (Stories 005/006/016/017/018), plus
/// `/.well-known/jwks.json` (ADR 0086/0087). Deliberately not wrapped by [`apply_auth_gate`] —
/// gating the login page itself behind a login check would be circular; each handler resolves
/// its own tenant/application from `Host` and checks tenant status itself
/// (`PortcullisState::resolve_active_host`), matching what the gate would have done anyway.
/// Leaves the state type parameter open (`Router<Arc<PortcullisState>>`) so the caller can merge
/// this with other same-state routers and call `.with_state(...)` exactly once on the fully
/// composed app (see authstar-proxy's `main.rs`).
pub fn oauth_routes() -> Router<Arc<PortcullisState>> {
    Router::new()
        .route("/oauth2/providers", get(providers_handler))
        .route("/oauth2/select", get(select_handler))
        .route("/oauth2/logout", get(logout_handler))
        .route("/oauth2/:name/login", get(login_handler))
        .route("/oauth2/:name/callback", get(callback_handler))
        .route("/.well-known/jwks.json", get(jwks_handler))
}

/// Wraps `router` with the authentication gate (Story 013). Apply this only to the
/// protected/proxied fallback, not to `oauth_routes()`.
pub fn apply_auth_gate(
    router: Router<Arc<PortcullisState>>,
    state: Arc<PortcullisState>,
) -> Router<Arc<PortcullisState>> {
    router.layer(from_fn_with_state(state, auth_gate))
}

/// Wraps `router` with CORS (Story 019). Apply this outermost, so it also covers `OPTIONS`
/// preflight on the public `/oauth2/*` routes.
pub fn apply_cors(
    router: Router<Arc<PortcullisState>>,
    state: Arc<PortcullisState>,
) -> Router<Arc<PortcullisState>> {
    router.layer(from_fn_with_state(state, cors_layer))
}
