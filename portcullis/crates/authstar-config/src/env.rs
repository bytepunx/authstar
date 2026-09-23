//! Bootstrap environment variables — the *only* env-configured values portcullis reads (Story
//! 001). Everything else comes from the signet bundle.

use std::env;

#[derive(Debug, thiserror::Error)]
pub enum BootstrapError {
    #[error("missing required environment variable {0}")]
    MissingVar(&'static str),
    #[error("environment variable {0} is set but empty")]
    EmptyVar(&'static str),
    #[error("exactly one of SIGNET_SPIFFE_ID or SIGNET_TRUST_DOMAIN must be set (neither found)")]
    MissingTrustDomainSource,
    #[error("SIGNET_SPIFFE_ID {0:?} is not a valid spiffe:// URI: {1}")]
    InvalidSpiffeId(String, String),
}

/// The bootstrap configuration read from the process environment at startup. Per Story 001,
/// missing/invalid required values are a startup failure with a clear error — never a silent
/// default.
#[derive(Debug, Clone)]
pub struct BootstrapEnv {
    /// signet's workload-facing gRPC address, e.g. `signet.signet.svc.cluster.local:8443`.
    pub addr: String,
    /// SPIFFE trust domain signet's server identity (and this workload's own SVID) must belong
    /// to. Derived from `SIGNET_TRUST_DOMAIN` directly, or from the authority component of
    /// `SIGNET_SPIFFE_ID` if that's what was set instead.
    pub trust_domain: String,
    /// SPIFFE Workload API socket, as a `unix://` URI (normalized from a bare path if needed).
    pub socket: String,
    /// signet namespace to fetch. Story 001 pins the real scope to `authstar`; overridable for
    /// local/dev clusters that use a different namespace.
    pub namespace: String,
    /// signet service to fetch. Story 001 pins the real scope to `portcullis`; overridable
    /// mainly for tests.
    pub service: String,
}

const DEFAULT_SOCKET: &str = "/run/spire/sockets/agent.sock";
const DEFAULT_NAMESPACE: &str = "authstar";
const DEFAULT_SERVICE: &str = "portcullis";

impl BootstrapEnv {
    pub fn from_env() -> Result<Self, BootstrapError> {
        let addr = require_nonempty("SIGNET_ADDR")?;

        let trust_domain = match (
            env::var("SIGNET_SPIFFE_ID").ok().filter(|v| !v.is_empty()),
            env::var("SIGNET_TRUST_DOMAIN")
                .ok()
                .filter(|v| !v.is_empty()),
        ) {
            (_, Some(td)) => td,
            (Some(spiffe_id), None) => trust_domain_from_spiffe_id(&spiffe_id)?,
            (None, None) => return Err(BootstrapError::MissingTrustDomainSource),
        };

        let socket = env::var("SPIFFE_SOCKET")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_SOCKET.to_string());
        let socket = normalize_socket_uri(&socket);

        let namespace = env::var("SIGNET_NAMESPACE")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_NAMESPACE.to_string());
        let service = env::var("SIGNET_SERVICE")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_SERVICE.to_string());

        Ok(Self {
            addr,
            trust_domain,
            socket,
            namespace,
            service,
        })
    }
}

fn require_nonempty(name: &'static str) -> Result<String, BootstrapError> {
    match env::var(name) {
        Ok(v) if v.is_empty() => Err(BootstrapError::EmptyVar(name)),
        Ok(v) => Ok(v),
        Err(_) => Err(BootstrapError::MissingVar(name)),
    }
}

/// `dial_workload`'s `socket_path` parameter expects a `unix://` URI (per the signet-client
/// echo example: `unix:///run/spiffe.io/spire-agent.sock`). Story 001 documents `SPIFFE_SOCKET`
/// as a bare path (default `/run/spire/sockets/agent.sock`), so normalize here rather than
/// forcing every deployer to remember the scheme.
fn normalize_socket_uri(socket: &str) -> String {
    if socket.starts_with("unix://") {
        socket.to_string()
    } else {
        format!("unix://{socket}")
    }
}

/// Extracts the trust domain (authority component) from a `spiffe://<trust-domain>/...` URI.
fn trust_domain_from_spiffe_id(spiffe_id: &str) -> Result<String, BootstrapError> {
    let rest = spiffe_id.strip_prefix("spiffe://").ok_or_else(|| {
        BootstrapError::InvalidSpiffeId(
            spiffe_id.to_string(),
            "missing spiffe:// scheme".to_string(),
        )
    })?;
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return Err(BootstrapError::InvalidSpiffeId(
            spiffe_id.to_string(),
            "empty trust domain authority".to_string(),
        ));
    }
    Ok(authority.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_bare_socket_path() {
        assert_eq!(
            normalize_socket_uri("/run/spire/sockets/agent.sock"),
            "unix:///run/spire/sockets/agent.sock"
        );
    }

    #[test]
    fn leaves_unix_uri_untouched() {
        assert_eq!(
            normalize_socket_uri("unix:///run/spiffe.io/spire-agent.sock"),
            "unix:///run/spiffe.io/spire-agent.sock"
        );
    }

    #[test]
    fn extracts_trust_domain_from_spiffe_id() {
        assert_eq!(
            trust_domain_from_spiffe_id("spiffe://example.org/ns/authstar/sa/signet").unwrap(),
            "example.org"
        );
    }

    #[test]
    fn rejects_spiffe_id_without_scheme() {
        assert!(trust_domain_from_spiffe_id("example.org/ns/authstar").is_err());
    }

    #[test]
    fn rejects_spiffe_id_with_empty_authority() {
        assert!(trust_domain_from_spiffe_id("spiffe:///ns/authstar").is_err());
    }
}
