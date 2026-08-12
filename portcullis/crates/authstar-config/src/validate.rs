//! Startup validation of the fetched bundle, beyond what serde's `Deserialize` already checks.
//! Failures here are startup errors (fail loud), matching Story 001's "never a silent default"
//! posture — but see [`validate_bundle`]'s doc comment for how failures are scoped per-tenant,
//! matching Story 004's per-tenant discovery-failure isolation.

use crate::bundle::{Bundle, KeyGeneration};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error(
        "tenant {tenant:?}: identity hash key retention window ({generations} generations) is \
         shorter than cookie.maxAge ({max_age}s) — a session could outlive every key generation \
         still available to verify hashes computed under it"
    )]
    InsufficientKeyRetention {
        tenant: String,
        generations: usize,
        max_age: u64,
    },
    #[error(
        "tenant {tenant:?}: {purpose} key generation {version} is declared more than once — \
         each version must appear at most once, whichever entry the bundle producer intended \
         is ambiguous"
    )]
    DuplicateKeyGeneration {
        tenant: String,
        purpose: &'static str,
        version: u32,
    },
    #[error("tenant {tenant:?} has no applications configured")]
    NoApplications { tenant: String },
    #[error("tenant {tenant:?} application {application:?} has no hosts configured")]
    NoHosts { tenant: String, application: String },
    #[error(
        "host {host:?} is claimed by both tenant {first_tenant:?}/{first_app:?} and \
         {second_tenant:?}/{second_app:?} — hosts must resolve to exactly one application"
    )]
    DuplicateHost {
        host: String,
        first_tenant: String,
        first_app: String,
        second_tenant: String,
        second_app: String,
    },
}

/// Validates cross-field invariants Story 001/003/013 depend on but that `serde::Deserialize`
/// alone can't express. Per Story 004's per-tenant-failure-isolation precedent, a single
/// mis-configured tenant should not need to break the whole bundle if we can help it — but the
/// two rules below (key retention, duplicate hosts) are structural enough that partial startup
/// isn't safe to attempt automatically, so this returns every violation found rather than
/// stopping at the first, letting the caller decide how to log/report them before failing
/// startup.
pub fn validate_bundle(bundle: &Bundle) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    let mut seen_hosts: Vec<(String, String, String)> = Vec::new(); // (host, tenant, app)

    for (tenant_slug, tenant) in &bundle.tenants {
        // Story 001: the identity-hash key retention window (how many past key generations are
        // still held, ADR 0027/0028) must cover a session cookie's full lifetime, so a session
        // minted under an older generation can still have its identityHash re-derived/verified
        // for as long as that session cookie remains valid. The bundle only gives us a *count*
        // of retained generations, not each one's rotation period, so we can't check the exact
        // duration math here — the one thing we *can* check without guessing at rotation
        // cadence is the obvious failure mode: a cookie with a nonzero lifetime but zero
        // retained key generations, which can never verify anything. Anything beyond that
        // (e.g. "3 generations covering a 30-day rotation period is enough for a 7-day cookie")
        // is a provisioning-time judgment call outside what this bundle shape can self-certify.
        let generations = tenant.identity_hash_key_generations.len();
        if generations == 0 && tenant.cookie.max_age > 0 {
            errors.push(ValidationError::InsufficientKeyRetention {
                tenant: tenant_slug.clone(),
                generations,
                max_age: tenant.cookie.max_age,
            });
        }

        // ADR 0088: session/internal key generations are populated by tower's rotate-keys
        // producer, not hand-authored — unlike identity-hash-key's "zero generations" case
        // above, there's no meaningful "too few generations" failure mode to check here (an
        // absent/empty list always resolves to the implicit version-1-at-the-legacy-name
        // generation, never zero). What *can* go wrong structurally is the producer emitting
        // the same version twice, which would make "which entry is current" ambiguous.
        push_duplicate_version_errors(
            &mut errors,
            tenant_slug,
            "identity hash",
            &tenant.identity_hash_key_generations,
        );
        push_duplicate_version_errors(
            &mut errors,
            tenant_slug,
            "session",
            &tenant.session_key_generations,
        );
        push_duplicate_version_errors(
            &mut errors,
            tenant_slug,
            "internal",
            &tenant.internal_key_generations,
        );

        if tenant.applications.is_empty() {
            errors.push(ValidationError::NoApplications {
                tenant: tenant_slug.clone(),
            });
            continue;
        }

        for (app_slug, app) in &tenant.applications {
            if app.hosts.is_empty() {
                errors.push(ValidationError::NoHosts {
                    tenant: tenant_slug.clone(),
                    application: app_slug.clone(),
                });
            }
            for host in &app.hosts {
                if let Some((_, first_tenant, first_app)) =
                    seen_hosts.iter().find(|(h, _, _)| h == host)
                {
                    errors.push(ValidationError::DuplicateHost {
                        host: host.clone(),
                        first_tenant: first_tenant.clone(),
                        first_app: first_app.clone(),
                        second_tenant: tenant_slug.clone(),
                        second_app: app_slug.clone(),
                    });
                } else {
                    seen_hosts.push((host.clone(), tenant_slug.clone(), app_slug.clone()));
                }
            }
        }
    }

    errors
}

fn push_duplicate_version_errors(
    errors: &mut Vec<ValidationError>,
    tenant_slug: &str,
    purpose: &'static str,
    generations: &[KeyGeneration],
) {
    let mut seen_versions: Vec<u32> = Vec::new();
    for generation in generations {
        if seen_versions.contains(&generation.version) {
            errors.push(ValidationError::DuplicateKeyGeneration {
                tenant: tenant_slug.to_string(),
                purpose,
                version: generation.version,
            });
        } else {
            seen_versions.push(generation.version);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_bundle(extra_tenant_fields: serde_json::Value) -> Bundle {
        let mut tenant = serde_json::json!({
            "cookie": { "domain": "acme.test", "maxAge": 604800 },
            "jwt": { "issuer": "authstar", "audience": "acme", "expiresIn": "168h" },
            "identityHashKeyGenerations": [{ "version": 1 }],
            "applications": {
                "app": {
                    "hosts": ["app.acme.test"],
                    "server": { "publicUrl": "http://app.acme.test" },
                    "upstream": { "base": "http://upstream.invalid" },
                }
            }
        });
        for (key, value) in extra_tenant_fields.as_object().unwrap() {
            tenant[key] = value.clone();
        }
        let bundle_json = serde_json::json!({ "tenants": { "acme": tenant } });
        serde_json::from_value(bundle_json).unwrap()
    }

    #[test]
    fn no_generations_declared_is_not_an_error_for_session_or_internal_keys() {
        let bundle = minimal_bundle(serde_json::json!({}));
        let errors = validate_bundle(&bundle);
        assert!(
            !errors.iter().any(|e| matches!(
                e,
                ValidationError::DuplicateKeyGeneration { .. }
                    | ValidationError::InsufficientKeyRetention { .. }
            )),
            "expected no key-generation errors, got: {errors:?}"
        );
    }

    #[test]
    fn duplicate_session_key_version_is_an_error() {
        let bundle = minimal_bundle(serde_json::json!({
            "sessionKeyGenerations": [{ "version": 1 }, { "version": 2 }, { "version": 2 }],
        }));
        let errors = validate_bundle(&bundle);
        assert!(errors.iter().any(|e| matches!(
            e,
            ValidationError::DuplicateKeyGeneration {
                purpose: "session",
                version: 2,
                ..
            }
        )));
    }

    #[test]
    fn duplicate_internal_key_version_is_an_error() {
        let bundle = minimal_bundle(serde_json::json!({
            "internalKeyGenerations": [{ "version": 3 }, { "version": 3 }],
        }));
        let errors = validate_bundle(&bundle);
        assert!(errors.iter().any(|e| matches!(
            e,
            ValidationError::DuplicateKeyGeneration {
                purpose: "internal",
                version: 3,
                ..
            }
        )));
    }

    #[test]
    fn unique_versions_across_all_three_purposes_is_not_an_error() {
        let bundle = minimal_bundle(serde_json::json!({
            "sessionKeyGenerations": [{ "version": 1 }, { "version": 2 }],
            "internalKeyGenerations": [{ "version": 1 }, { "version": 2 }, { "version": 3 }],
        }));
        let errors = validate_bundle(&bundle);
        assert!(!errors
            .iter()
            .any(|e| matches!(e, ValidationError::DuplicateKeyGeneration { .. })));
    }
}
