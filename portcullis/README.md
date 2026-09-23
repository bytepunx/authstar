# portcullis

The edge reverse-proxy for [authstar](../claude.md): OAuth2/OIDC login, session/internal JWT
issuance and verification, claims enrichment via `tower`, and prefix-based reverse proxying to
each tenant application's upstream — all configured from a single [signet](https://github.com/bytepunx/signet)
bundle fetched over SPIFFE mTLS at startup. No local YAML/env-file configuration, no static
secrets on disk.

Built from scratch in Rust/axum, using [`ref-proxy`](../ref-proxy) as a structural reference for
the HTTP/routing shape and [`design/stories/proxy/`](../design/stories/proxy) as the acceptance
criteria. See [`TESTING.md`](./TESTING.md) for exactly what's implemented, how it's tested
(including a real signet integration run against a live cluster), and what's deliberately
deferred.

## Workspace layout

```
crates/
  authstar-config/      signet integration: bootstrap env, SPIFFE mTLS dial, bundle fetch,
                         typed bundle model, secret decoding, startup validation
  authstar-middleware/  the auth engine: OIDC discovery, OAuth2 login/callback/logout, session +
                         internal JWT, identity hash, claims enrichment (real tower HTTP client),
                         the auth gate, exempt-route matching, CORS, /oauth2/providers + /select
  authstar-proxy/       the `portcullis` binary: wires signet -> runtime state -> axum app,
                         prefix-based reverse-proxy forwarding, graceful restart-lock shutdown
```

`authstar-config` has no HTTP-framework dependency at all — it only knows signet. `authstar-
middleware` knows nothing about reverse proxying — it's a reusable axum auth layer, structured
the same way ref-proxy's own `authstar-middleware` crate was (a library a consumer's router
merges in), just now built around a real signet-fetched multi-tenant/multi-application bundle
instead of `serde_yaml`. `authstar-proxy` is the one crate that knows about upstream forwarding
and is the only crate with a `main.rs`.

## Configuration

There is no config file and no config env vars beyond the four bootstrap variables Story 001
specifies — everything else (tenants, applications, providers, cookies, JWT settings, CORS,
upstream routing, branding, key material) comes from the signet bundle:

| Env var | Required | Purpose |
|---|---|---|
| `SIGNET_ADDR` | yes | signet's workload gRPC address |
| `SIGNET_TRUST_DOMAIN` | one of this or `SIGNET_SPIFFE_ID` | SPIFFE trust domain to authorize |
| `SIGNET_SPIFFE_ID` | one of this or `SIGNET_TRUST_DOMAIN` | trust domain derived from its authority component |
| `SPIFFE_SOCKET` | no (default `/run/spire/sockets/agent.sock`) | SPIFFE Workload API socket path |
| `SIGNET_NAMESPACE` | no (default `authstar`) | signet namespace to fetch |
| `SIGNET_SERVICE` | no (default `portcullis`) | signet service to fetch |

See `crates/authstar-config/src/bundle.rs` for the full typed bundle shape, and `TESTING.md` for
several explicitly-documented judgment calls made where the design-story digest available while
building this didn't spell out a literal wire contract (tower's `/enrich` and
`/identities/resolve` response shapes, OAuth2 provider client secrets living in signet's
`secrets` map rather than plain config, a `towerUpstream` bundle field alongside `webUpstream`).

## Running locally

```bash
cargo build --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

There's no docker-compose story (per the root `claude.md`) — local/CI testing against a real
signet uses [kluster](https://github.com/bytepunx/kluster)'s `signet` profile:

```bash
kluster up --profile signet --name dev-signet
```

See `TESTING.md`'s "Real signet integration" section for the exact steps used to register and
run a live smoke test against a cluster like this.

## Docker

```bash
docker build -t portcullis:latest .
```

Multi-stage `cargo-chef` build (adapted from `ref-proxy`'s Dockerfile), distroless runtime image,
listens on `3710`.

## Scope

This is the critical path only — not all 27 design stories. See `TESTING.md` for the full
implemented-vs-deferred breakdown; short version: everything through CORS/logout/provider
listing (Stories 001, 003–010, 011, 012, 013–019) is implemented and tested. WebSocket
passthrough (011a) and the analytics/usage-metering/webhook-passthrough/branded-page/self-
service stories (020–027) are deferred.
