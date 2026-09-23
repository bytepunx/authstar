//! Per design/decisions/0101-api-keys.md. Parses the `Authorization` header for portcullis's
//! second credential transport -- `Bearer authstar_{apiKeyId}_{secret}` -- distinct from the
//! session cookie every browser flow uses.
//!
//! **Any `Authorization: Bearer` header at all is treated as an attempted API-key credential**,
//! never merely ignored -- a browser session travels exclusively by cookie in this system, so a
//! Bearer header is, by construction, a non-session (API/programmatic) client. This is what lets
//! `gate.rs` always answer a malformed one with a 401, never an HTML login redirect, regardless
//! of what `is_browser_request`'s own heuristics (`Accept` header, etc.) might otherwise suggest.

use axum::http::{header, HeaderMap};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApiKeyCredential {
    /// No `Authorization` header at all, or one that isn't `Bearer` -- falls through to the
    /// existing session/browser-redirect logic unchanged.
    Absent,
    /// An `Authorization: Bearer` header present, but the token doesn't parse as
    /// `authstar_{apiKeyId}_{secret}`.
    Malformed,
    Present { api_key_id: String, secret: String },
}

/// `secret` is `randomBytes(32).toString('base64url')` (tower's `api-key-secret.ts`) -- the
/// base64url alphabet includes `_`, so this must not naively `split('_')` the whole token (that
/// would truncate any secret containing one). Splitting only the *first* `_` after the fixed
/// `authstar_` prefix correctly hands everything else, underscores included, to `secret` --
/// `apiKeyId` itself (a node-flakes base62 id) never contains one.
pub fn parse_api_key_header(headers: &HeaderMap) -> ApiKeyCredential {
    let Some(raw) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return ApiKeyCredential::Absent;
    };
    let Some(token) = raw.strip_prefix("Bearer ") else {
        return ApiKeyCredential::Absent;
    };
    match token
        .strip_prefix("authstar_")
        .and_then(|rest| rest.split_once('_'))
    {
        Some((api_key_id, secret)) if !api_key_id.is_empty() && !secret.is_empty() => {
            ApiKeyCredential::Present {
                api_key_id: api_key_id.to_string(),
                secret: secret.to_string(),
            }
        }
        _ => ApiKeyCredential::Malformed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with_auth(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, value.parse().unwrap());
        headers
    }

    #[test]
    fn absent_when_no_authorization_header() {
        assert_eq!(parse_api_key_header(&HeaderMap::new()), ApiKeyCredential::Absent);
    }

    #[test]
    fn absent_when_not_bearer() {
        let headers = headers_with_auth("Basic dXNlcjpwYXNz");
        assert_eq!(parse_api_key_header(&headers), ApiKeyCredential::Absent);
    }

    #[test]
    fn parses_well_formed_credential() {
        let headers = headers_with_auth("Bearer authstar_apikey-1_c2VjcmV0");
        assert_eq!(
            parse_api_key_header(&headers),
            ApiKeyCredential::Present {
                api_key_id: "apikey-1".to_string(),
                secret: "c2VjcmV0".to_string(),
            }
        );
    }

    #[test]
    fn secret_containing_underscores_is_preserved_whole() {
        let headers = headers_with_auth("Bearer authstar_apikey-1_ab_cd_ef");
        assert_eq!(
            parse_api_key_header(&headers),
            ApiKeyCredential::Present {
                api_key_id: "apikey-1".to_string(),
                secret: "ab_cd_ef".to_string(),
            }
        );
    }

    #[test]
    fn malformed_when_missing_authstar_prefix() {
        let headers = headers_with_auth("Bearer sometoken");
        assert_eq!(parse_api_key_header(&headers), ApiKeyCredential::Malformed);
    }

    #[test]
    fn malformed_when_missing_secret_segment() {
        let headers = headers_with_auth("Bearer authstar_apikey-1");
        assert_eq!(parse_api_key_header(&headers), ApiKeyCredential::Malformed);
    }

    #[test]
    fn malformed_when_id_segment_empty() {
        let headers = headers_with_auth("Bearer authstar__secret");
        assert_eq!(parse_api_key_header(&headers), ApiKeyCredential::Malformed);
    }
}
