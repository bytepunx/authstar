//! Return URL preservation (Story 007): the gate stashes the original path+query in the
//! `authstar-return` cookie before redirecting to login; the callback reads it back and
//! validates it before redirecting there instead of `/`.

/// A relative path is safe to redirect to iff it starts with `/` and does not start with `//`
/// (which browsers treat as protocol-relative, i.e. a hop to a different origin).
pub fn is_safe_return_url(url: &str) -> bool {
    url.starts_with('/') && !url.starts_with("//")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_simple_paths() {
        assert!(is_safe_return_url("/dashboard"));
        assert!(is_safe_return_url("/app/settings?tab=profile"));
        assert!(is_safe_return_url("/"));
    }

    #[test]
    fn rejects_protocol_relative() {
        assert!(!is_safe_return_url("//evil.com"));
    }

    #[test]
    fn rejects_absolute_urls() {
        assert!(!is_safe_return_url("https://evil.com"));
    }

    #[test]
    fn rejects_javascript_scheme() {
        assert!(!is_safe_return_url("javascript:alert(1)"));
    }

    #[test]
    fn rejects_empty() {
        assert!(!is_safe_return_url(""));
    }
}
