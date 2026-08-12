//! The bundle's reserved `secrets` key: a map of secret names to base64-encoded plaintext
//! values (per `GetServiceBundleResponse.bundle`'s doc comment in signet-client). Decoded once
//! at fetch time and held only in memory — never logged, never written to disk.

use base64::Engine;
use indexmap::IndexMap;
use std::fmt;

#[derive(Clone)]
pub struct RawSecrets(IndexMap<String, Vec<u8>>);

impl fmt::Debug for RawSecrets {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Deliberately never print values: names only, and even those only as a count, so a
        // stray `{:?}` in a log statement can't leak secret material or even which secrets
        // exist.
        write!(f, "RawSecrets({} entries)", self.0.len())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SecretsError {
    #[error("secret {0:?} is not valid base64: {1}")]
    InvalidBase64(String, base64::DecodeError),
    #[error("missing secret {0:?}")]
    Missing(String),
    #[error("secret {0:?} is not valid UTF-8")]
    InvalidUtf8(String),
}

impl RawSecrets {
    /// Parses the `secrets` object out of the bundle's raw JSON representation (see
    /// `struct_json`), base64-decoding every value. Absent `secrets` key -> empty map, not an
    /// error (a bundle with zero tenants configured, e.g. very first boot, has nothing to
    /// decode).
    pub fn from_bundle_json(bundle: &serde_json::Value) -> Result<Self, SecretsError> {
        let mut out = IndexMap::new();
        let Some(secrets) = bundle.get("secrets").and_then(|v| v.as_object()) else {
            return Ok(Self(out));
        };
        for (name, value) in secrets {
            let Some(encoded) = value.as_str() else {
                continue;
            };
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|e| SecretsError::InvalidBase64(name.clone(), e))?;
            out.insert(name.clone(), decoded);
        }
        Ok(Self(out))
    }

    pub fn get(&self, name: &str) -> Result<&[u8], SecretsError> {
        self.0
            .get(name)
            .map(|v| v.as_slice())
            .ok_or_else(|| SecretsError::Missing(name.to_string()))
    }

    pub fn get_string(&self, name: &str) -> Result<String, SecretsError> {
        let bytes = self.get(name)?;
        String::from_utf8(bytes.to_vec()).map_err(|_| SecretsError::InvalidUtf8(name.to_string()))
    }

    pub fn contains(&self, name: &str) -> bool {
        self.0.contains_key(name)
    }
}

/// The well-known secret name for a tenant's session-JWT signing keypair (private key PEM).
/// Always version 1's name — see `session_key_name_for_version`'s doc comment for why version 1
/// never moves off this name even once a tenant has rotated (ADR 0088).
pub fn session_key_name(tenant_slug: &str) -> String {
    format!("tenant-{tenant_slug}-session-key")
}

/// The well-known secret name for a tenant's internal-JWT signing keypair (private key PEM).
/// Always version 1's name — see `internal_key_name_for_version`'s doc comment.
pub fn internal_key_name(tenant_slug: &str) -> String {
    format!("tenant-{tenant_slug}-internal-key")
}

/// The secret name for one generation of a tenant's session-JWT signing keypair (ADR 0088).
/// Version 1 is always `session_key_name`'s existing unversioned name — every tenant already
/// has a secret there today, and there is no migration to force onto tenants that never rotate.
/// Version 2 and beyond get their own versioned name, created only the first time a tenant
/// actually rotates.
pub fn session_key_name_for_version(tenant_slug: &str, version: u32) -> String {
    if version <= 1 {
        session_key_name(tenant_slug)
    } else {
        format!("tenant-{tenant_slug}-session-key-{version}")
    }
}

/// The secret name for one generation of a tenant's internal-JWT signing keypair (ADR 0088).
/// Same version-1-is-the-legacy-name convention as `session_key_name_for_version`.
pub fn internal_key_name_for_version(tenant_slug: &str, version: u32) -> String {
    if version <= 1 {
        internal_key_name(tenant_slug)
    } else {
        format!("tenant-{tenant_slug}-internal-key-{version}")
    }
}

/// The well-known secret name for one generation of a tenant's identity-hash HMAC key.
pub fn identity_hash_key_name(tenant_slug: &str, version: u32) -> String {
    format!("tenant-{tenant_slug}-identity-hash-key-{version}")
}

/// The well-known secret name for a tenant's OAuth2 provider client secret.
///
/// Judgment call: the design-stories digest available while writing this crate described
/// provider "credentials" (clientId/clientSecret/discoveryUrl/scope) as a single group without
/// being explicit about signet's plain-config/secret split for this particular field. Given
/// signet's entire premise is separating plain config from encrypted-at-rest secrets, and an
/// OAuth2 client secret is unambiguously a secret, this pass treats it as one — named per
/// tenant *and* provider, since a tenant can configure more than one IdP. `bundle::ProviderConfig`
/// deliberately has no `client_secret` field for the same reason. Documented in TESTING.md.
pub fn provider_client_secret_name(tenant_slug: &str, provider_name: &str) -> String {
    format!("tenant-{tenant_slug}-provider-{provider_name}-client-secret")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_secrets_from_bundle_json() {
        let encoded = base64::engine::general_purpose::STANDARD.encode(b"hello");
        let json = serde_json::json!({ "secrets": { "tenant-acme-session-key": encoded } });
        let secrets = RawSecrets::from_bundle_json(&json).unwrap();
        assert_eq!(
            secrets.get_string("tenant-acme-session-key").unwrap(),
            "hello"
        );
    }

    #[test]
    fn missing_secrets_key_yields_empty() {
        let json = serde_json::json!({});
        let secrets = RawSecrets::from_bundle_json(&json).unwrap();
        assert!(!secrets.contains("anything"));
    }

    #[test]
    fn missing_named_secret_is_an_error() {
        let json = serde_json::json!({ "secrets": {} });
        let secrets = RawSecrets::from_bundle_json(&json).unwrap();
        assert!(matches!(
            secrets.get("tenant-acme-session-key"),
            Err(SecretsError::Missing(_))
        ));
    }

    #[test]
    fn session_key_version_1_is_the_legacy_unversioned_name() {
        assert_eq!(
            session_key_name_for_version("acme", 1),
            session_key_name("acme")
        );
        assert_eq!(
            session_key_name_for_version("acme", 1),
            "tenant-acme-session-key"
        );
    }

    #[test]
    fn session_key_version_2_gets_a_versioned_name() {
        assert_eq!(
            session_key_name_for_version("acme", 2),
            "tenant-acme-session-key-2"
        );
    }

    #[test]
    fn internal_key_version_1_is_the_legacy_unversioned_name() {
        assert_eq!(
            internal_key_name_for_version("acme", 1),
            internal_key_name("acme")
        );
        assert_eq!(
            internal_key_name_for_version("acme", 1),
            "tenant-acme-internal-key"
        );
    }

    #[test]
    fn internal_key_version_2_gets_a_versioned_name() {
        assert_eq!(
            internal_key_name_for_version("acme", 2),
            "tenant-acme-internal-key-2"
        );
    }
}
