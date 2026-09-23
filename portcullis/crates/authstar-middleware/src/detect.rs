//! Browser vs. API client detection (Story 014) — a pure function of the `Accept` header, used
//! by the gate to decide between a redirect (browser) and a `401` (API client).

use axum::http::HeaderMap;

pub fn is_browser_request(headers: &HeaderMap) -> bool {
    match headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
    {
        None => true,
        Some(accept) => {
            let accept = accept.to_ascii_lowercase();
            accept.contains("text/html") || accept.trim() == "*/*"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers_with_accept(value: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(
            axum::http::header::ACCEPT,
            HeaderValue::from_str(value).unwrap(),
        );
        h
    }

    #[test]
    fn no_accept_header_is_browser() {
        assert!(is_browser_request(&HeaderMap::new()));
    }

    #[test]
    fn text_html_is_browser() {
        assert!(is_browser_request(&headers_with_accept("text/html")));
    }

    #[test]
    fn full_browser_accept_header_is_browser() {
        assert!(is_browser_request(&headers_with_accept(
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        )));
    }

    #[test]
    fn application_json_is_api_client() {
        assert!(!is_browser_request(&headers_with_accept(
            "application/json"
        )));
    }

    #[test]
    fn json_with_fallback_is_api_client() {
        assert!(!is_browser_request(&headers_with_accept(
            "application/json, text/plain, */*"
        )));
    }

    #[test]
    fn bare_wildcard_is_browser() {
        assert!(is_browser_request(&headers_with_accept("*/*")));
    }
}
