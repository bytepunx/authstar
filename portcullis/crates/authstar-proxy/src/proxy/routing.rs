//! Prefix-based multi-upstream routing (Story 012). Longest matching prefix wins; equal-length
//! ties go to whichever was defined earlier in the application's `upstream.routes` insertion
//! order. No match at all falls back to `upstream.base` with the path unchanged.

use indexmap::IndexMap;

#[derive(Clone)]
pub struct RouteResolver {
    /// `(prefix, upstream_base)`, sorted longest-prefix-first (ties broken by original
    /// insertion order, since a stable sort preserves relative order of equal-length entries).
    routes: Vec<(String, String)>,
    fallback: String,
}

impl RouteResolver {
    pub fn new(routes: &IndexMap<String, String>, fallback: String) -> Self {
        let mut routes: Vec<(String, String)> =
            routes.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        // `sort_by` is stable, so equal-length prefixes keep their original (insertion) order —
        // exactly the "earlier definition wins the tie" rule Story 012 specifies.
        routes.sort_by_key(|(prefix, _)| std::cmp::Reverse(prefix.len()));
        Self { routes, fallback }
    }

    /// Returns `(upstream_base, forwarded_path)` — the matched prefix stripped from `path`
    /// (empty remainder becomes `/`), or the unmodified path against `fallback` if nothing
    /// matched.
    pub fn resolve<'a>(&'a self, path: &str) -> (&'a str, String) {
        for (prefix, upstream) in &self.routes {
            if path == prefix {
                return (upstream, "/".to_string());
            }
            if let Some(stripped) = path.strip_prefix(prefix.as_str()) {
                if stripped.starts_with('/') {
                    return (upstream, stripped.to_string());
                }
            }
        }
        (&self.fallback, path.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolver() -> RouteResolver {
        let mut routes = IndexMap::new();
        routes.insert("/api".to_string(), "http://api-service".to_string());
        routes.insert("/api/admin".to_string(), "http://admin-service".to_string());
        routes.insert("/assets".to_string(), "http://cdn-service".to_string());
        RouteResolver::new(&routes, "http://web-service".to_string())
    }

    #[test]
    fn longest_prefix_wins() {
        let r = resolver();
        let (upstream, path) = r.resolve("/api/admin/users");
        assert_eq!(upstream, "http://admin-service");
        assert_eq!(path, "/users");
    }

    #[test]
    fn shorter_prefix_used_when_longer_does_not_match() {
        let r = resolver();
        let (upstream, path) = r.resolve("/api/users");
        assert_eq!(upstream, "http://api-service");
        assert_eq!(path, "/users");
    }

    #[test]
    fn exact_prefix_match_strips_to_root() {
        let r = resolver();
        let (upstream, path) = r.resolve("/assets");
        assert_eq!(upstream, "http://cdn-service");
        assert_eq!(path, "/");
    }

    #[test]
    fn no_match_falls_back_to_base_with_original_path() {
        let r = resolver();
        let (upstream, path) = r.resolve("/other");
        assert_eq!(upstream, "http://web-service");
        assert_eq!(path, "/other");
    }

    #[test]
    fn does_not_match_unrelated_longer_segment() {
        // "/apikeys" should NOT match prefix "/api" (must be a path-segment boundary).
        let r = resolver();
        let (upstream, path) = r.resolve("/apikeys");
        assert_eq!(upstream, "http://web-service");
        assert_eq!(path, "/apikeys");
    }

    #[test]
    fn equal_length_ties_prefer_earlier_definition() {
        let mut routes = IndexMap::new();
        routes.insert("/a".to_string(), "http://first".to_string());
        routes.insert("/b".to_string(), "http://second".to_string());
        let resolver = RouteResolver::new(&routes, "http://fallback".to_string());
        let (upstream, _) = resolver.resolve("/a");
        assert_eq!(upstream, "http://first");
    }
}
