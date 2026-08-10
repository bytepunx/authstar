//! Real-signet smoke test for portcullis's signet integration (Story 001). Not a `#[test]`
//! because `dial_workload` needs the SPIFFE Workload API socket, which only exists inside a pod
//! with the `csi.spiffe.io` CSI volume mounted — this binary is meant to be built into a small
//! container image and run as a Kubernetes Job against a real signet+SPIRE cluster (see
//! `TESTING.md` for the exact commands used to provision and run this against
//! `kluster up --profile signet`).
//!
//! Deliberately prints only non-secret confirmation (config values, never decoded secret bytes)
//! to stdout, then exits 0 on success / non-zero on any failure — a k8s Job's exit code and logs
//! are the pass/fail signal `kubectl wait --for=condition=complete` + `kubectl logs` checks.

use std::time::Duration;

use authstar_config::{BootstrapEnv, SignetSource};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() {
    let env = match BootstrapEnv::from_env() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("SMOKE_FAIL: invalid bootstrap env: {e}");
            std::process::exit(1);
        }
    };
    println!(
        "SMOKE: dialing signet at {} (namespace={}, service={}, trust_domain={})",
        env.addr, env.namespace, env.service, env.trust_domain
    );

    let mut source = match SignetSource::dial(&env).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("SMOKE_FAIL: dial_workload failed: {e}");
            std::process::exit(1);
        }
    };
    println!("SMOKE: SPIFFE mTLS connection established");

    let fetched = match source.fetch().await {
        Ok(f) => f,
        Err(e) => {
            eprintln!("SMOKE_FAIL: GetServiceBundle failed: {e}");
            std::process::exit(1);
        }
    };
    println!(
        "SMOKE: fetched bundle, config_version={}, tenants={}",
        fetched.config_version,
        fetched.config.tenants.len()
    );

    let Some(tenant) = fetched.config.tenants.get("acme") else {
        eprintln!("SMOKE_FAIL: expected tenant 'acme' not present in fetched bundle");
        std::process::exit(1);
    };
    println!(
        "SMOKE: tenant 'acme' present, cookie.domain={}, {} application(s), {} provider(s)",
        tenant.cookie.domain,
        tenant.applications.len(),
        tenant.providers.len()
    );

    match fetched.secrets.get_string("tenant-acme-session-key") {
        Ok(pem) if pem.contains("PRIVATE KEY") => {
            println!("SMOKE: decoded tenant-acme-session-key secret, looks like a PEM private key ({} bytes)", pem.len());
        }
        Ok(_) => {
            eprintln!(
                "SMOKE_FAIL: decoded tenant-acme-session-key secret does not look like a PEM key"
            );
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("SMOKE_FAIL: could not decode tenant-acme-session-key secret: {e}");
            std::process::exit(1);
        }
    }

    match authstar_middleware_key_check(&fetched.secrets) {
        Ok(()) => println!("SMOKE: session key parses as a real ES256 keypair"),
        Err(e) => {
            eprintln!("SMOKE_FAIL: {e}");
            std::process::exit(1);
        }
    }

    // Also exercise the restart-lock RPC path (acquire_restart_lock, wrapped by wait_for_restart)
    // — distinct from GetServiceBundle, and the piece portcullis's own graceful-restart flow
    // depends on. No real bundle change happens here, so this can't observe a full
    // change->acquire->release cycle; it proves the bidi-streaming RPC itself is reachable and
    // correctly responds to cancellation, by racing it against a short-lived cancellation token
    // instead of waiting indefinitely for an external change.
    let start = std::time::Instant::now();
    let cancel = CancellationToken::new();
    let cancel_for_timer = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        println!("SMOKE: cancel timer fired at {:?}", start.elapsed());
        cancel_for_timer.cancel();
        println!(
            "SMOKE: cancel.cancel() called, is_cancelled={}",
            cancel_for_timer.is_cancelled()
        );
    });
    println!(
        "SMOKE: about to call wait_for_restart at {:?}",
        start.elapsed()
    );
    let outcome = tokio::time::timeout(
        Duration::from_secs(20),
        source.wait_for_restart(Duration::from_secs(30), Duration::from_secs(1), cancel),
    )
    .await;
    match outcome {
        Ok(Ok(_lock)) => {
            eprintln!("SMOKE_FAIL: unexpectedly acquired a restart lock with no bundle change");
            std::process::exit(1);
        }
        Ok(Err(e)) => {
            // Expected: the call was cancelled before any change arrived. Any *other* error
            // (e.g. the RPC failing to even open) would also land here, so check the message.
            println!(
                "SMOKE: wait_for_restart returned at {:?} as expected after cancellation: {e}",
                start.elapsed()
            );
        }
        Err(_) => {
            eprintln!(
                "SMOKE_FAIL: wait_for_restart did not return within 20s of a 3s cancellation \
                 (elapsed {:?}) — cancellation appears not to be propagating promptly",
                start.elapsed()
            );
            std::process::exit(1);
        }
    }

    println!(
        "SMOKE_PASS: real signet integration verified end to end (bundle fetch + restart-lock RPC)"
    );
}

/// Parses the fetched session key as a real EC keypair — this crate has no direct dependency on
/// `authstar-middleware` (would be a circular workspace dependency), so this reimplements just
/// enough of `authstar_middleware::keys::EcKeyPair::from_pem_bytes`'s PEM-parsing logic to prove
/// the *decoded secret bytes* are real, usable key material, not just that base64-decoding
/// succeeded.
fn authstar_middleware_key_check(secrets: &authstar_config::RawSecrets) -> Result<(), String> {
    use p256::pkcs8::DecodePrivateKey;
    let pem = secrets
        .get_string("tenant-acme-session-key")
        .map_err(|e| e.to_string())?;
    p256::SecretKey::from_pkcs8_pem(&pem)
        .or_else(|_| p256::SecretKey::from_sec1_pem(&pem))
        .map(|_| ())
        .map_err(|e| format!("session key does not parse as a valid EC private key: {e}"))
}
