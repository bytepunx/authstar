//! East-west SPIFFE mTLS: builds a `reqwest::Client` for portcullis to call another
//! SPIFFE-identified workload within the same trust domain — tower today (`/enrich`,
//! `/identities/resolve`), and keep/herald/lookout/web once their own listeners terminate
//! SPIFFE mTLS. This is the counterpart to `client.rs`'s *north-south* dial to signet itself;
//! `client.rs` calls this "north-south", the doc comments there and in `TESTING.md` call this
//! "east-west".
//!
//! This opens a second, independent SPIFFE Workload API connection from the one
//! `SignetSource::dial` uses internally (that one is entirely owned by `signet-client`'s
//! `dial_workload` and never exposed to callers) — same socket, same underlying portcullis
//! SVID, just a second logical stream to the same local SPIRE agent, which is the ordinary way
//! to have more than one `spiffe::X509Source` alive in a process.
//!
//! The shape mirrors `dial_workload`'s own implementation
//! (`signet-client/src/client.rs`'s `workload` module) closely on purpose: same
//! `spiffe::X509Source::builder().endpoint(...).build()`, same
//! `spiffe_rustls::authorizer::trust_domains([td])` + `TrustDomainPolicy::LocalOnly(td)`
//! policy (accept any SPIFFE ID within portcullis's own trust domain — tower's own specific
//! SPIFFE ID isn't part of the bundle schema today, see `bundle.rs`'s `tower_upstream` doc
//! comment for that judgment call). The one real difference: `dial_workload` hands the
//! resulting TLS config to `tonic`/gRPC via a hand-rolled `tower::Service` connector; this
//! hands it to `reqwest` via `ClientBuilder::use_preconfigured_tls`, which is the officially
//! supported way to plug a caller-built `rustls::ClientConfig` into `reqwest`.
//!
//! **What's verified and how** — see `TESTING.md`'s "east-west mTLS" section for the full
//! writeup; short version: [`http_client_from_tls_config`] (the `reqwest`+`rustls` wiring) has
//! a real, non-mocked test in `tests/mtls_integration_tests.rs` — a genuine local TLS listener,
//! genuine mutual-TLS handshake, genuine HTTP round trip. [`dial_east_west_client_config`] (the
//! SPIFFE-specific half: sourcing portcullis's own SVID from the Workload API and building the
//! SPIFFE-aware verifier/resolver via `spiffe_rustls`) is not independently `#[test]`-covered
//! here, for the same reason `SignetSource::dial` isn't: it needs a live SPIFFE Workload API
//! socket, which only exists inside a pod with the `csi.spiffe.io` CSI volume mounted.

use std::time::Duration;

use spiffe::TrustDomain;

use crate::env::BootstrapEnv;

/// Errors from building portcullis's east-west (tower, and later keep/herald/lookout/web)
/// SPIFFE mTLS HTTP client.
#[derive(Debug, thiserror::Error)]
pub enum EastWestMtlsError {
    #[error("connect to SPIFFE Workload API at {socket:?}: {source}")]
    WorkloadApi {
        socket: String,
        #[source]
        source: spiffe::x509_source::X509SourceError,
    },
    #[error("invalid trust domain {0:?}: {1}")]
    InvalidTrustDomain(String, String),
    #[error("build SPIFFE mTLS client config: {0}")]
    SpiffeTls(#[from] spiffe_rustls::Error),
    #[error("build reqwest client from SPIFFE mTLS config: {0}")]
    BuildClient(#[from] reqwest::Error),
}

/// Dials the same SPIFFE Workload API socket portcullis already uses for its signet connection
/// (`env.socket`) and builds a `rustls::ClientConfig` that:
///
/// * presents portcullis's own current SVID as the TLS client certificate on every handshake
/// * validates the peer's certificate chain against the Workload API's trust bundle for
///   `env.trust_domain`, and authorizes any SPIFFE ID within that trust domain (not a specific
///   expected identity — see the module doc comment for why)
///
/// The returned config is backed by a live `spiffe::X509Source` that keeps rotating its SVID
/// and trust bundle for the life of the process, exactly like `dial_workload`'s own `Channel` —
/// there is no separate "closer" to call.
pub async fn dial_east_west_client_config(
    env: &BootstrapEnv,
) -> Result<rustls::ClientConfig, EastWestMtlsError> {
    let source = spiffe::X509Source::builder()
        .endpoint(&env.socket)
        .build()
        .await
        .map_err(|source| EastWestMtlsError::WorkloadApi {
            socket: env.socket.clone(),
            source,
        })?;

    let trust_domain = TrustDomain::try_from(env.trust_domain.as_str()).map_err(|e| {
        EastWestMtlsError::InvalidTrustDomain(env.trust_domain.clone(), e.to_string())
    })?;

    let authorizer = spiffe_rustls::authorizer::trust_domains([trust_domain.clone()])?;

    let tls_config = spiffe_rustls::mtls_client(source)
        .authorize(authorizer)
        .trust_domain_policy(spiffe_rustls::TrustDomainPolicy::LocalOnly(trust_domain))
        .build()?;

    Ok(tls_config)
}

/// Wires an already-built `rustls::ClientConfig` (SPIFFE-sourced in production via
/// [`dial_east_west_client_config`]; a hand-built one carrying SPIFFE-shaped certs in
/// `tests/mtls_integration_tests.rs`) into a `reqwest::Client`. Split out from
/// [`dial_east_west_client_config`] specifically so this — the part that doesn't need a live
/// SPIFFE Workload API — has a real test.
pub fn http_client_from_tls_config(
    tls_config: rustls::ClientConfig,
    timeout: Duration,
) -> Result<reqwest::Client, EastWestMtlsError> {
    reqwest::Client::builder()
        .use_preconfigured_tls(tls_config)
        .timeout(timeout)
        .build()
        .map_err(EastWestMtlsError::BuildClient)
}

/// Convenience wrapper: [`dial_east_west_client_config`] then [`http_client_from_tls_config`].
/// This is what `authstar-proxy/src/main.rs` calls at startup to build the tower-bound client.
pub async fn dial_east_west_http_client(
    env: &BootstrapEnv,
    timeout: Duration,
) -> Result<reqwest::Client, EastWestMtlsError> {
    let tls_config = dial_east_west_client_config(env).await?;
    http_client_from_tls_config(tls_config, timeout)
}
