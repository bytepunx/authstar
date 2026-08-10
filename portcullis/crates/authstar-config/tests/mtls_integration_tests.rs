//! Proves `authstar_config::mtls::http_client_from_tls_config` — the `reqwest`+`rustls` half of
//! portcullis's east-west SPIFFE mTLS wiring — actually performs a real mutual-TLS handshake:
//! the client presents its own certificate, and the client validates the server's.
//!
//! **What this does and doesn't prove, precisely** (see `TESTING.md`'s "east-west mTLS"
//! section for the full writeup): every TLS/TCP/HTTP mechanic here is genuine — a real
//! `TcpListener` on loopback, a real `rustls` mutual-TLS handshake via `tokio-rustls`, a real
//! HTTP/1.1 request/response round trip through `reqwest`. What's *not* real is the identity
//! source: the certificates are hand-built with `rcgen` (carrying SPIFFE-shaped URI SANs, e.g.
//! `spiffe://test.example/tower`) rather than issued by a live SPIRE Workload API, and
//! verification here uses `rustls`'s standard `WebPkiClientVerifier`/`WebPkiServerVerifier`
//! (which check the cert chain and, for the server side, the presented hostname/IP SAN)
//! rather than `spiffe-rustls`'s own SPIFFE-ID-URI-SAN verifier (which needs a live
//! `spiffe::X509Source` to construct at all, and is `spiffe-rustls`'s own tested
//! responsibility, not this crate's). What this crate's own code owns — correctly handing a
//! `rustls::ClientConfig` to `reqwest` such that it presents a client cert and validates the
//! server's — is exactly what these tests exercise directly, against the exact function
//! (`http_client_from_tls_config`) production code calls.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use authstar_config::mtls::http_client_from_tls_config;
use rcgen::{BasicConstraints, Certificate, CertificateParams, IsCa, Issuer, KeyPair, SanType};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::server::WebPkiClientVerifier;
use rustls::{ClientConfig, RootCertStore, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

/// A CA plus the two end-entity certs a test needs: a "server" (standing in for tower) and a
/// "client" (standing in for portcullis), both carrying a SPIFFE-shaped URI SAN, both signed by
/// the same CA. The server cert also carries a loopback IP SAN, since `rustls`'s standard
/// `WebPkiServerVerifier` (unlike `spiffe-rustls`'s own) checks the connection hostname against
/// the presented SAN, not just the SPIFFE URI.
struct TestPki {
    ca_der: CertificateDer<'static>,
    server_cert_der: CertificateDer<'static>,
    server_key_der: Vec<u8>,
    client_cert_der: CertificateDer<'static>,
    client_key_der: Vec<u8>,
}

/// Both a `ring` and an `aws-lc-rs` crypto provider end up compiled into this test binary
/// (`ring` transitively via `spiffe-rustls`'s own default feature, `aws-lc-rs` transitively via
/// `signet-client`'s plain `rustls` dependency) — `rustls::ClientConfig::builder()`/
/// `ServerConfig::builder()` need exactly one installed as the process default before they can
/// pick a default. Production code never hits this: `spiffe_rustls::mtls_client(..).build()`
/// calls the equivalent of this internally. Idempotent (each `#[tokio::test]` may run in the
/// same process), so a failed `install_default()` from a second call is expected and ignored.
fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn build_pki() -> TestPki {
    ensure_crypto_provider();
    let mut ca_params =
        CertificateParams::new(Vec::default()).expect("empty SAN list is always valid");
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let ca_key = KeyPair::generate().expect("generate CA key");
    let ca_cert = ca_params.self_signed(&ca_key).expect("self-sign CA cert");
    let issuer = Issuer::new(ca_params, ca_key);

    let (server_cert, server_key) = leaf_cert(
        &issuer,
        "spiffe://test.example/tower",
        &[SanType::IpAddress("127.0.0.1".parse().unwrap())],
    );
    let (client_cert, client_key) = leaf_cert(&issuer, "spiffe://test.example/portcullis", &[]);

    TestPki {
        ca_der: ca_cert.der().clone(),
        server_cert_der: server_cert.der().clone(),
        server_key_der: server_key.serialize_der(),
        client_cert_der: client_cert.der().clone(),
        client_key_der: client_key.serialize_der(),
    }
}

fn leaf_cert(
    issuer: &Issuer<'static, KeyPair>,
    spiffe_uri: &str,
    extra_sans: &[SanType],
) -> (Certificate, KeyPair) {
    let mut params = CertificateParams::new(Vec::default()).expect("empty SAN list is valid");
    params
        .subject_alt_names
        .push(SanType::URI(spiffe_uri.try_into().expect("valid URI SAN")));
    params.subject_alt_names.extend_from_slice(extra_sans);
    let key = KeyPair::generate().expect("generate leaf key");
    let cert = params
        .signed_by(&key, issuer)
        .expect("sign leaf cert with CA");
    (cert, key)
}

fn private_key(der: &[u8]) -> PrivateKeyDer<'static> {
    PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(der.to_vec()))
}

/// A `rustls::ServerConfig` that requires and validates a client certificate against `roots`,
/// presenting `server_cert`/`server_key` — the server side of the handshake under test.
fn mtls_server_config(
    roots: &RootCertStore,
    server_cert: CertificateDer<'static>,
    server_key: PrivateKeyDer<'static>,
) -> ServerConfig {
    let verifier = WebPkiClientVerifier::builder(Arc::new(roots.clone()))
        .build()
        .expect("build client cert verifier");
    ServerConfig::builder()
        .with_client_cert_verifier(verifier)
        .with_single_cert(vec![server_cert], server_key)
        .expect("build server config")
}

/// Spawns a one-shot TLS server on loopback: accepts exactly one TCP connection, completes the
/// TLS handshake (which is where mTLS enforcement actually happens), and if that succeeds,
/// writes a minimal valid HTTP/1.1 response. Returns the bound address and a handle whose
/// `await` resolves to `Ok(())` if the TLS handshake succeeded, `Err` otherwise — the signal
/// this test suite actually cares about.
async fn spawn_tls_server(
    config: ServerConfig,
) -> (SocketAddr, tokio::task::JoinHandle<std::io::Result<()>>) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback listener");
    let addr = listener.local_addr().expect("local addr");
    let acceptor = TlsAcceptor::from(Arc::new(config));

    let handle = tokio::spawn(async move {
        let (tcp, _) = listener.accept().await?;
        let mut tls = acceptor.accept(tcp).await?;
        // Drain whatever the client sent (a real HTTP/1.1 request from reqwest) so it doesn't
        // block waiting for a response it'll never fully receive if we short-circuit — an
        // over-simplified but real HTTP/1.1 response is enough for reqwest to parse.
        let mut buf = [0u8; 1024];
        let _ = tls.read(&mut buf).await;
        tls.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok")
            .await?;
        tls.shutdown().await?;
        Ok(())
    });

    (addr, handle)
}

#[tokio::test]
async fn mtls_client_presents_cert_and_validates_server_end_to_end() {
    let pki = build_pki();

    let mut server_roots = RootCertStore::empty();
    server_roots
        .add(pki.ca_der.clone())
        .expect("add CA to server trust store");
    let server_config = mtls_server_config(
        &server_roots,
        pki.server_cert_der.clone(),
        private_key(&pki.server_key_der),
    );
    let (addr, server_handle) = spawn_tls_server(server_config).await;

    let mut client_roots = RootCertStore::empty();
    client_roots
        .add(pki.ca_der.clone())
        .expect("add CA to client trust store");
    let client_config = ClientConfig::builder()
        .with_root_certificates(client_roots)
        .with_client_auth_cert(
            vec![pki.client_cert_der.clone()],
            private_key(&pki.client_key_der),
        )
        .expect("attach client cert to config");

    let client = http_client_from_tls_config(client_config, Duration::from_secs(5))
        .expect("build reqwest client from preconfigured rustls TLS config");

    let response =
        client.get(format!("https://{addr}/")).send().await.expect(
            "mTLS request should succeed: client presents its cert, validates the server's",
        );
    assert_eq!(response.status(), 200);
    assert_eq!(response.text().await.unwrap(), "ok");

    server_handle
        .await
        .expect("server task panicked")
        .expect("server-side TLS handshake should have succeeded");
}

#[tokio::test]
async fn mtls_client_without_a_certificate_is_rejected_by_the_server() {
    let pki = build_pki();

    let mut server_roots = RootCertStore::empty();
    server_roots.add(pki.ca_der.clone()).unwrap();
    let server_config = mtls_server_config(
        &server_roots,
        pki.server_cert_der.clone(),
        private_key(&pki.server_key_der),
    );
    let (addr, server_handle) = spawn_tls_server(server_config).await;

    let mut client_roots = RootCertStore::empty();
    client_roots.add(pki.ca_der.clone()).unwrap();
    // Deliberately no `.with_client_auth_cert(...)` — an anonymous client, proving the server's
    // "client cert required" enforcement is real rather than accidentally satisfied.
    let client_config = ClientConfig::builder()
        .with_root_certificates(client_roots)
        .with_no_client_auth();

    let client = http_client_from_tls_config(client_config, Duration::from_secs(5)).unwrap();

    let result = client.get(format!("https://{addr}/")).send().await;
    assert!(
        result.is_err(),
        "server requires a client cert; an anonymous client must be rejected"
    );

    // The server-side accept() is expected to fail too (no client cert offered); either way,
    // don't let a hung server task fail the test on its own.
    let _ = server_handle.await;
}

#[tokio::test]
async fn mtls_client_rejects_server_cert_from_an_untrusted_ca() {
    let pki = build_pki();
    // A second, unrelated CA/cert set — the server presents a cert the client has no reason to
    // trust, proving server-certificate validation is real rather than skipped.
    let other_pki = build_pki();

    let mut server_roots = RootCertStore::empty();
    server_roots.add(pki.ca_der.clone()).unwrap();
    let server_config = mtls_server_config(
        &server_roots,
        pki.server_cert_der.clone(),
        private_key(&pki.server_key_der),
    );
    let (addr, server_handle) = spawn_tls_server(server_config).await;

    // Client trusts `other_pki`'s CA, not the one that actually signed the server's cert.
    let mut client_roots = RootCertStore::empty();
    client_roots.add(other_pki.ca_der.clone()).unwrap();
    let client_config = ClientConfig::builder()
        .with_root_certificates(client_roots)
        .with_client_auth_cert(
            vec![pki.client_cert_der.clone()],
            private_key(&pki.client_key_der),
        )
        .expect("attach client cert to config");

    let client = http_client_from_tls_config(client_config, Duration::from_secs(5)).unwrap();

    let result = client.get(format!("https://{addr}/")).send().await;
    assert!(
        result.is_err(),
        "client must reject a server certificate chaining to an untrusted CA"
    );

    let _ = server_handle.await;
}
