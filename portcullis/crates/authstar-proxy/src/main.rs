//! portcullis entrypoint. Startup sequence (Story 001, following `signet-client`'s own
//! documented contract — see `crates/authstar-config/src/client.rs`):
//!
//! 1. Read bootstrap env vars, dial signet over SPIFFE mTLS.
//! 2. Fetch the single bundle once, configure everything in memory (`authstar_middleware::state::
//!    build_state`).
//! 3. Serve traffic.
//! 4. Concurrently, wait for signet to report a bundle change AND this replica to acquire the
//!    fleet-wide restart lock.
//! 5. On that resolving (or SIGTERM/SIGINT): graceful shutdown, release the lock, exit(0).
//!    Kubernetes restarts the pod; the new process repeats from step 1 with the new bundle.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use authstar_config::validate::validate_bundle;
use authstar_config::{BootstrapEnv, SignetSource};
use authstar_middleware::enricher::{ClaimsEnricher, TowerClaimsEnricher};
use authstar_middleware::router::{apply_auth_gate, apply_cors, oauth_routes};
use authstar_middleware::state::{build_state, PortcullisState};
use authstar_proxy::proxy::proxy_handler;
use axum::Router;
use tokio_util::sync::CancellationToken;

/// portcullis listens on this port unconditionally. Story 001's bundle shape (as documented in
/// the story digest available while writing this crate) has no per-tenant/global `server.port`
/// field of its own for portcullis's own listener (only per-application `server.publicUrl`,
/// which is the externally-visible URL, not portcullis's bind port) — so this is a fixed
/// constant rather than a bundle-driven value, matching ref-proxy's own default. Documented as a
/// judgment call in TESTING.md.
const LISTEN_PORT: u16 = 3710;

const RESTART_LOCK_TTL: Duration = Duration::from_secs(30);
const RESTART_DEBOUNCE: Duration = Duration::from_secs(5);

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let env = match BootstrapEnv::from_env() {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "invalid bootstrap configuration");
            std::process::exit(1);
        }
    };

    tracing::info!(
        addr = %env.addr,
        namespace = %env.namespace,
        service = %env.service,
        "dialing signet"
    );

    let cancel = CancellationToken::new();
    install_signal_handler(cancel.clone());

    let mut source = tokio::select! {
        res = SignetSource::dial(&env) => match res {
            Ok(s) => s,
            Err(e) => {
                tracing::error!(error = %e, "failed to dial signet");
                std::process::exit(1);
            }
        },
        () = cancel.cancelled() => {
            tracing::info!("cancelled before connecting to signet");
            return;
        }
    };

    let fetched = tokio::select! {
        res = source.fetch() => match res {
            Ok(f) => f,
            Err(e) => {
                tracing::error!(error = %e, "failed to fetch bundle from signet");
                std::process::exit(1);
            }
        },
        () = cancel.cancelled() => {
            tracing::info!("cancelled before fetching bundle");
            return;
        }
    };

    tracing::info!(
        config_version = fetched.config_version,
        tenants = fetched.config.tenants.len(),
        "fetched bundle from signet"
    );

    let validation_errors = validate_bundle(&fetched.config);
    if !validation_errors.is_empty() {
        for e in &validation_errors {
            tracing::error!(error = %e, "bundle validation failed");
        }
        std::process::exit(1);
    }

    // Plain TLS, public-CA-verified: only ever used for 3rd-party OIDC providers (discovery,
    // token exchange, userinfo) — see `build_state`'s call below and `PortcullisState::
    // http_client`'s own doc comment for why this must stay separate from `tower_http_client`.
    let http_client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "failed to build http client");
            std::process::exit(1);
        }
    };

    // SPIFFE mTLS, not plain TLS: presents portcullis's own SVID and validates the peer's,
    // exactly like the signet bundle fetch above (`SignetSource::dial`) — see
    // `authstar_config::mtls` for the implementation and TESTING.md for how it's verified.
    // Fatal on failure, same as the signet dial above: both dial the same SPIFFE Workload API
    // socket for the same underlying reason (portcullis's own identity), so if this one can't
    // connect, the signet dial already would have failed first.
    let tower_http_client = match authstar_config::mtls::dial_east_west_http_client(
        &env,
        Duration::from_secs(30),
    )
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "failed to build SPIFFE mTLS client for tower");
            std::process::exit(1);
        }
    };

    let tower_base_url = fetched
        .config
        .tower_upstream
        .as_ref()
        .map(|t| t.address.clone())
        .unwrap_or_default();
    if tower_base_url.is_empty() {
        tracing::warn!(
            "no towerUpstream configured in bundle — claims enrichment and identity \
             resolution will always report Unreachable"
        );
    }

    let enricher: Arc<dyn ClaimsEnricher> = Arc::new(TowerClaimsEnricher::new(
        tower_http_client.clone(),
        tower_base_url.clone(),
    ));

    let (state, warnings) = build_state(
        fetched.config,
        fetched.secrets,
        http_client,
        tower_http_client,
        enricher,
        tower_base_url,
    )
    .await;

    for warning in &warnings {
        tracing::warn!(%warning, "startup warning");
    }
    tracing::info!(
        tenants = state.tenants.len(),
        hosts = state.host_index.len(),
        "runtime state built"
    );

    let state = Arc::new(state);

    let app = build_app(state.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], LISTEN_PORT));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(error = %e, %addr, "failed to bind listener");
            std::process::exit(1);
        }
    };
    tracing::info!(%addr, "listening");

    let server_cancel = cancel.clone();
    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        server_cancel.cancelled().await;
    });

    let restart_wait = source.wait_for_restart(RESTART_LOCK_TTL, RESTART_DEBOUNCE, cancel.clone());

    tokio::select! {
        result = server => {
            if let Err(e) = result {
                tracing::error!(error = %e, "server error");
            }
        }
        result = restart_wait => {
            match result {
                Ok(lock) => {
                    tracing::info!("bundle changed and restart lock acquired — shutting down");
                    cancel.cancel();
                    if let Err(e) = lock.release().await {
                        tracing::warn!(error = %e, "lock release failed (it will still expire via TTL)");
                    }
                }
                Err(e) => {
                    tracing::error!(error = %e, "restart-wait failed");
                    cancel.cancel();
                }
            }
        }
    }

    tracing::info!("shutdown complete");
    std::process::exit(0);
}

fn build_app(state: Arc<PortcullisState>) -> Router {
    let proxy_router: Router<Arc<PortcullisState>> = Router::new().fallback(proxy_handler);
    let proxy_router = apply_auth_gate(proxy_router, state.clone());

    let app: Router<Arc<PortcullisState>> = Router::new().merge(oauth_routes()).merge(proxy_router);
    let app = apply_cors(app, state.clone());
    app.with_state(state)
}

fn install_signal_handler(cancel: CancellationToken) {
    tokio::spawn(async move {
        let ctrl_c = async {
            tokio::signal::ctrl_c().await.ok();
        };
        #[cfg(unix)]
        let terminate = async {
            match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                Ok(mut sig) => {
                    sig.recv().await;
                }
                Err(_) => std::future::pending::<()>().await,
            }
        };
        #[cfg(not(unix))]
        let terminate = std::future::pending::<()>();

        tokio::select! {
            _ = ctrl_c => {}
            _ = terminate => {}
        }
        tracing::info!("received shutdown signal");
        cancel.cancel();
    });
}
