//! Small cookie-building helpers shared by the OAuth2 flow, gate, and logout handlers. Builds
//! real `Set-Cookie` header values via the `cookie` crate rather than axum_extra's jar API, so
//! callers can attach cookies to whatever response type they're building without threading a
//! `CookieJar` through every handler signature.

use cookie::time::Duration as CookieDuration;
use cookie::{Cookie, SameSite};

/// Builds a `Set-Cookie` header value for a new cookie.
#[allow(clippy::too_many_arguments)]
pub fn build_cookie(
    name: &str,
    value: &str,
    path: &str,
    domain: Option<&str>,
    max_age_secs: u64,
    http_only: bool,
    secure: bool,
    same_site: SameSite,
) -> String {
    let mut builder = Cookie::build((name.to_string(), value.to_string()))
        .path(path.to_string())
        .http_only(http_only)
        .same_site(same_site)
        .max_age(CookieDuration::seconds(max_age_secs as i64));
    if secure {
        builder = builder.secure(true);
    }
    if let Some(domain) = domain {
        if !domain.is_empty() {
            builder = builder.domain(domain.to_string());
        }
    }
    builder.build().to_string()
}

/// Builds a `Set-Cookie` header value that immediately expires a previously-set cookie. Must
/// use the same `path`/`domain` the cookie was originally set with, since those are part of a
/// cookie's identity.
pub fn expired_cookie(name: &str, path: &str, domain: Option<&str>) -> String {
    let mut builder = Cookie::build((name.to_string(), String::new()))
        .path(path.to_string())
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(CookieDuration::seconds(0))
        .expires(cookie::time::OffsetDateTime::UNIX_EPOCH);
    if let Some(domain) = domain {
        if !domain.is_empty() {
            builder = builder.domain(domain.to_string());
        }
    }
    builder.build().to_string()
}

/// Reads a cookie's value out of a raw `Cookie` request header, if present.
pub fn read_cookie(cookie_header: &str, name: &str) -> Option<String> {
    cookie::Cookie::split_parse(cookie_header)
        .filter_map(|c| c.ok())
        .find(|c| c.name() == name)
        .map(|c| c.value().to_string())
}

/// Reads a cookie's value directly out of an axum `HeaderMap`'s (possibly multiple) `Cookie`
/// headers.
pub fn read_cookie_from_headers(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|raw| read_cookie(raw, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_cookie_with_domain_and_secure() {
        let s = build_cookie(
            "jwt",
            "abc123",
            "/",
            Some("example.com"),
            3600,
            true,
            true,
            SameSite::Lax,
        );
        assert!(s.contains("jwt=abc123"));
        assert!(s.contains("Domain=example.com"));
        assert!(s.contains("Secure"));
        assert!(s.contains("HttpOnly"));
    }

    #[test]
    fn expired_cookie_has_max_age_zero() {
        let s = expired_cookie("jwt", "/", Some("example.com"));
        assert!(s.contains("Max-Age=0"));
    }
}
