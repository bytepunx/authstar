//! Signet-backed configuration/secrets for portcullis (Story 001).
//!
//! portcullis has no local YAML/env-file configuration story: at startup it dials signet over
//! SPIFFE mTLS (`SignetSource::dial`), fetches its single bundle (`SignetSource::fetch`), and
//! configures itself entirely in memory. Bundle changes are picked up by exiting the process and
//! letting Kubernetes restart it (`SignetSource::wait_for_restart`), coordinated fleet-wide via
//! signet's own restart lock — never a hot in-place config swap. See `client.rs` for the exact
//! sequence and `signet-client`'s own README for the protocol this implements.

pub mod bundle;
pub mod client;
pub mod env;
pub mod mtls;
pub mod secrets;
mod struct_json;
pub mod validate;

pub use bundle::Bundle;
pub use client::{FetchedBundle, SignetError, SignetSource};
pub use env::{BootstrapEnv, BootstrapError};
pub use mtls::EastWestMtlsError;
pub use secrets::{RawSecrets, SecretsError};
