//! Thin wrapper over `signet-client`'s workload API, scoped to exactly what portcullis needs:
//! dial once over SPIFFE mTLS, fetch the single-scope bundle, and later wait for the
//! coordinated-restart handoff. See Story 001 and the `signet-client` crate's own README for the
//! protocol this implements — this module adds no protocol logic of its own, just portcullis's
//! bundle-shape decoding on top.

use std::time::Duration;

use signet_client::signet::v1::secrets_service_client::SecretsServiceClient;
use signet_client::signet::v1::GetServiceBundleRequest;
use signet_client::{dial_workload, wait_for_restart, ClientError, Lock, RestartError};
use tokio_util::sync::CancellationToken;
use tonic::transport::Channel;

use crate::bundle::Bundle;
use crate::env::BootstrapEnv;
use crate::secrets::{RawSecrets, SecretsError};
use crate::struct_json::struct_to_json;

#[derive(Debug, thiserror::Error)]
pub enum SignetError {
    #[error("dial signet workload endpoint: {0}")]
    Dial(#[source] ClientError),
    #[error("fetch service bundle: {0}")]
    Fetch(#[source] tonic::Status),
    #[error("bundle response had no `bundle` payload (config_version={0})")]
    EmptyBundle(i32),
    #[error("decode bundle secrets: {0}")]
    Secrets(#[from] SecretsError),
    #[error("parse bundle config: {0}")]
    ParseConfig(#[from] serde_json::Error),
    #[error(transparent)]
    Restart(#[from] RestartError),
}

/// The result of one `GetServiceBundle` call: the typed non-secret config, decoded secrets, and
/// signet's own version counter for the config document (useful for startup logging — never for
/// deciding whether to refetch, that's what the restart-lock watch is for).
pub struct FetchedBundle {
    pub config: Bundle,
    pub secrets: RawSecrets,
    pub config_version: i32,
}

/// A dialed connection to signet's workload-facing `SecretsService`, scoped to one
/// namespace/service pair (portcullis's own `ns/authstar/sa/portcullis`, or whatever
/// `SIGNET_NAMESPACE`/`SIGNET_SERVICE` resolve to).
pub struct SignetSource {
    client: SecretsServiceClient<Channel>,
    namespace: String,
    service: String,
}

impl SignetSource {
    /// Opens the SPIFFE mTLS connection to signet's workload listener. Does not fetch anything
    /// yet — call [`SignetSource::fetch`] next.
    pub async fn dial(env: &BootstrapEnv) -> Result<Self, SignetError> {
        let channel = dial_workload(&env.addr, &env.socket, &env.trust_domain)
            .await
            .map_err(SignetError::Dial)?;
        Ok(Self {
            client: SecretsServiceClient::new(channel),
            namespace: env.namespace.clone(),
            service: env.service.clone(),
        })
    }

    /// Fetches the current bundle for this source's namespace/service, decoding config and
    /// secrets into typed/decoded form. Safe to call more than once on the same source (though
    /// portcullis's own startup flow only calls it once — see `wait_for_restart` below for how
    /// changes are picked up).
    pub async fn fetch(&mut self) -> Result<FetchedBundle, SignetError> {
        let response = self
            .client
            .get_service_bundle(GetServiceBundleRequest {
                namespace: self.namespace.clone(),
                service: self.service.clone(),
            })
            .await
            .map_err(SignetError::Fetch)?
            .into_inner();

        let Some(raw_struct) = response.bundle else {
            return Err(SignetError::EmptyBundle(response.config_version));
        };

        let json = struct_to_json(&raw_struct);
        let secrets = RawSecrets::from_bundle_json(&json)?;
        let config: Bundle = serde_json::from_value(json)?;

        Ok(FetchedBundle {
            config,
            secrets,
            config_version: response.config_version,
        })
    }

    /// Blocks until signet reports a bundle change AND this replica has acquired the
    /// fleet-wide restart lock. Consumes `self` (matches `signet-client`'s own
    /// `wait_for_restart` signature, which takes the gRPC client by value) — by design, per the
    /// crate's own contract, this does *not* refetch the bundle; the caller's own graceful
    /// shutdown + process exit is what hands off to a fresh process that fetches anew.
    pub async fn wait_for_restart(
        self,
        ttl: Duration,
        debounce: Duration,
        cancel: CancellationToken,
    ) -> Result<Lock, SignetError> {
        let lock = wait_for_restart(
            self.client,
            self.namespace,
            self.service,
            ttl,
            debounce,
            cancel,
        )
        .await?;
        Ok(lock)
    }
}
