//! Identity hash computation (ADR 0027/0028, Story 006): the raw IdP `sub` is hashed
//! immediately on receipt and never retained/forwarded/logged in raw form. Tower only ever sees
//! the hash, keyed per-tenant, per-key-generation.

use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// `HMAC-SHA256(key, tenant + ':' + idp + ':' + sub)`, base64url (no padding) encoded. `key` is
/// the raw bytes of one identity-hash key generation's secret.
pub fn compute_identity_hash(key: &[u8], tenant: &str, idp: &str, sub: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(tenant.as_bytes());
    mac.update(b":");
    mac.update(idp.as_bytes());
    mac.update(b":");
    mac.update(sub.as_bytes());
    let result = mac.finalize().into_bytes();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(result)
}

/// One tenant's ordered set of identity-hash key generations, current first — the shape Story
/// 006 needs to compute the full candidate-hash list sent to tower's `POST /identities/resolve`.
pub struct IdentityHashKeys {
    /// `(version, key_bytes)`, ordered current-generation first (highest version first).
    generations: Vec<(u32, Vec<u8>)>,
}

impl IdentityHashKeys {
    pub fn new(mut generations: Vec<(u32, Vec<u8>)>) -> Self {
        generations.sort_by_key(|(version, _)| std::cmp::Reverse(*version));
        Self { generations }
    }

    pub fn is_empty(&self) -> bool {
        self.generations.is_empty()
    }

    /// The current (highest-version) generation's key, if any.
    pub fn current(&self) -> Option<&[u8]> {
        self.generations.first().map(|(_, k)| k.as_slice())
    }

    /// Every candidate hash for this `(tenant, idp, sub)`, current generation first — sent to
    /// tower's `POST /identities/resolve` so a `sub` hashed under a since-rotated-out key can
    /// still be matched (ADR 0028's aliasing).
    pub fn all_candidate_hashes(&self, tenant: &str, idp: &str, sub: &str) -> Vec<String> {
        self.generations
            .iter()
            .map(|(_, key)| compute_identity_hash(key, tenant, idp, sub))
            .collect()
    }

    /// The hash under the *current* generation only — what Story 006 says every issued session
    /// always carries, regardless of which candidate tower actually matched.
    pub fn current_hash(&self, tenant: &str, idp: &str, sub: &str) -> Option<String> {
        self.current()
            .map(|key| compute_identity_hash(key, tenant, idp, sub))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_for_same_inputs() {
        let h1 = compute_identity_hash(b"key", "acme", "google", "sub-123");
        let h2 = compute_identity_hash(b"key", "acme", "google", "sub-123");
        assert_eq!(h1, h2);
    }

    #[test]
    fn different_tenant_yields_different_hash() {
        let h1 = compute_identity_hash(b"key", "acme", "google", "sub-123");
        let h2 = compute_identity_hash(b"key", "widgetco", "google", "sub-123");
        assert_ne!(h1, h2);
    }

    #[test]
    fn candidate_list_is_current_generation_first() {
        let keys = IdentityHashKeys::new(vec![
            (1, b"old-key".to_vec()),
            (3, b"newest-key".to_vec()),
            (2, b"mid-key".to_vec()),
        ]);
        let candidates = keys.all_candidate_hashes("acme", "google", "sub-123");
        assert_eq!(candidates.len(), 3);
        assert_eq!(
            candidates[0],
            compute_identity_hash(b"newest-key", "acme", "google", "sub-123")
        );
        assert_eq!(
            keys.current_hash("acme", "google", "sub-123").unwrap(),
            candidates[0]
        );
    }
}
