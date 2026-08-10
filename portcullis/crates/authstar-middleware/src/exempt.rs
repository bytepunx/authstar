//! Exempt route pattern matching (Story 003).

/// Tests `path` (query string already stripped by the caller, or stripped here if not) against
/// every pattern in `patterns`. Two pattern kinds: exact match, or a trailing `/*` prefix
/// wildcard (`/api/public/*` matches `/api/public` itself and anything starting
/// `/api/public/`, but not `/api/publicstuff`).
pub fn is_exempt(path: &str, patterns: &[String]) -> bool {
    let path = path.split('?').next().unwrap_or(path);
    patterns
        .iter()
        .any(|pattern| matches_pattern(path, pattern))
}

fn matches_pattern(path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/*") {
        path == prefix || path.starts_with(&format!("{prefix}/"))
    } else {
        path == pattern
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patterns() -> Vec<String> {
        vec!["/health".to_string(), "/api/public/*".to_string()]
    }

    #[test]
    fn exact_match() {
        assert!(is_exempt("/health", &patterns()));
    }

    #[test]
    fn exact_match_ignores_query_string() {
        assert!(is_exempt("/health?check=1", &patterns()));
    }

    #[test]
    fn no_partial_exact_match() {
        assert!(!is_exempt("/healthz", &patterns()));
    }

    #[test]
    fn prefix_wildcard_matches_subpath() {
        assert!(is_exempt("/api/public/users", &patterns()));
    }

    #[test]
    fn prefix_wildcard_matches_bare_prefix() {
        assert!(is_exempt("/api/public", &patterns()));
    }

    #[test]
    fn prefix_wildcard_does_not_match_unrelated_suffix() {
        assert!(!is_exempt("/api/publicstuff", &patterns()));
    }

    #[test]
    fn unmatched_path_is_not_exempt() {
        assert!(!is_exempt("/api/private", &patterns()));
    }
}
