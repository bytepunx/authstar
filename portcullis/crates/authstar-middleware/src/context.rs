//! Request-extension types the gate hands downstream to the proxy handler, so the two crates
//! don't need to share anything beyond `axum::http::Request::extensions()`.

#[derive(Debug, Clone)]
pub struct ForwardContext {
    pub tenant_slug: String,
    pub application_slug: String,
    /// `Some` iff the gate minted an internal token for this request (any authenticated request,
    /// `Allow` or fail-open `degraded`). `None` means forward with no `Authorization` header at
    /// all — either genuinely anonymous-on-an-exempt-route, or a `Deny`/fail-closed outcome on
    /// an exempt route (Story 013/015: never rejected, but never given credentials either).
    pub internal_token: Option<String>,
}
