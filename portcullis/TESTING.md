# Testing Conventions

Rust's normal `cargo test` conventions, not a forced port of the Node services' three-npm-script
tier naming — but the same underlying philosophy as every other authstar service's `TESTING.md`:

- **Unit tests** (`#[cfg(test)] mod tests` inline, one per module) — pure-function/small-surface
  contracts with no I/O: exempt-route matching, browser detection, PKCE/duration parsing, prefix
  routing, cookie building, identity-hash HMAC, key parsing/fingerprinting, enrichment-response
  parsing, startup-bundle validation.
- **Behavior/integration tests** (`crates/authstar-middleware/tests/integration_tests.rs`,
  `crates/authstar-proxy/tests/integration_tests.rs`) — a real axum app (the actual gate, CORS
  layer, OAuth2 routes, and reverse-proxy handler — not mocks of them), driven in-process via
  `tower::ServiceExt::oneshot`, with only the *external* dependencies faked: `wiremock` stands in
  for the OIDC provider and for tower, and for authstar-proxy's own tests, for the tenant
  upstream. This is the same shape ref-proxy's own integration tests used, and matches every
  other authstar service's "real request handling, faked external calls" behavior tier.
- **Real-transport integration tests** (`crates/authstar-config/tests/mtls_integration_tests.rs`)
  — a third tier, added this pass, for exactly one thing that doesn't fit either bucket above: the
  east-west SPIFFE mTLS wiring (see "East-west mTLS for tower" below). Not pure-function (it opens
  real loopback TCP+TLS connections), and not "fake the external dependency, drive the real app"
  either — there's no axum app here, just a real `rustls` mutual-TLS handshake against a real
  local listener, proving the `reqwest`+`rustls` transport plumbing is genuine rather than mocked.
- **Real signet integration** (`crates/authstar-config/examples/signet_smoke.rs`) — not a
  `#[test]`, because `dial_workload` needs the SPIFFE Workload API socket, which only exists
  inside a pod with the `csi.spiffe.io` CSI volume mounted. This *was actually run* against a
  live signet+SPIRE cluster during this pass — see "Real signet integration" below for exactly
  what was verified, the bug it found (and the fix), and the anomaly it surfaced.

Run everything:

```bash
cargo build --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

**Test counts, all green**: `authstar-config` 12 unit + 3 real-transport mTLS integration tests;
`authstar-middleware` 46 unit + 23 integration tests; `authstar-proxy` 6 unit + 6 integration
tests. **96 tests total.** Clean `cargo build --workspace` and clean `cargo clippy --workspace
--all-targets -- -D warnings` (zero warnings, not just zero errors).

---

## Coverage — implemented vs. deferred

Per the driving task's instruction to prioritize a coherent, fully-working critical path over
shallow coverage of all 27 design stories (the same scoping call `keep`/`herald`/`steward`/`web`
each made), this pass implements the full critical-path list end to end:

| Story | What's implemented | Depth |
|---|---|---|
| 001 — Configuration and secrets | Bootstrap env parsing, `dial_workload`, `GetServiceBundle`, typed bundle model, secret decoding, startup validation, restart-lock wait/release | Full — unit tests, and a **real** live run against signet (see below) |
| 003 — Exempt route matching | Exact + trailing-`/*` prefix matching | Full — unit tests match the story's own test table exactly |
| 004 — OIDC discovery | Concurrent per-tenant/provider discovery, per-tenant/provider failure isolation, 10s timeout | Full, minus the `/provider-discovery-status` fire-and-forget report to tower (see Deferred) |
| 005 — OAuth2 login initiation | PKCE (S256), CSRF state, cookie issuance | Full — RFC 7636 test vector, integration tests |
| 006 — OAuth2 callback | State/PKCE validation, token exchange, userinfo fetch, identity hash + tower `/identities/resolve`, session issuance | Full — minus the identity-*linking* branch (Story 024, deferred) and the `signup-completed` analytics dispatch (Story 020, deferred — logged instead) |
| 007 — Return URL preservation | `authstar-return` cookie, `is_safe_return_url` | Full — story's own test table covered exactly |
| 008 — JWT session cookie issuance | ES256 signing, per-tenant keys from signet secrets, full claims/cookie tables | Full |
| 009 — JWT verification | `kid`-selected key, issuer/audience/expiry checks, 30s leeway | Full — no rotation-overlap (see Judgment calls) |
| 010 — Internal JWT generation | Allow/Deny/Unreachable three-way outcome, role merge, `enrichment_status`, 60s TTL | Full, with one documented policy simplification (fail-open only, see Judgment calls) |
| 011 — HTTP reverse proxy | Method/header/body forwarding, hop-by-hop stripping, `X-Forwarded-*`, 502/504 mapping | Full, minus true streaming (buffers request/response bodies, matching ref-proxy's own behavior — see Judgment calls) |
| 011a — WebSocket upgrade | — | **Deferred**, see below |
| 012 — Prefix route matching | Longest-prefix-wins, stable tie-break, path stripping | Full — story's own example table covered exactly |
| 013 — Authentication gate | Tenant status check before application resolution, JWT verify, exempt check, enrichment branching | Full |
| 014 — Browser/API detection | `Accept` header heuristic | Full — story's own test table covered exactly |
| 015 — Gate rejection responses | 401/403+/503 generic bodies, `WWW-Authenticate`, detail-server-side-only | Full |
| 016 — Logout | Cookie clearing, redirect | Full |
| 017 — Provider list endpoint | JSON list, capitalized display names, working-providers-only | Full |
| 018 — Provider selection page | Minimal HTML picker | Full (as the story's own fallback path; Story 023's `web`-proxying primary path is deferred) |
| 019 — CORS | Origin matching, preflight, credentialed headers | Full |
| 020 — Analytics event ingestion | — | **Deferred** |
| 021 — Usage metering reporting | — | **Deferred** |
| 022 — Stripe webhook passthrough | — | **Deferred** |
| 023 — Branded page proxying | — | **Deferred** |
| 024 — Self-service identity linking | — | **Deferred** |
| 025 — Self-service widget data proxying | — | **Deferred** |
| 026 — SES webhook passthrough | — | **Deferred** |
| 027 — Batched usage reporting | — | **Deferred** |

### Why 020–027 (and 011a) are deferred

Per the driving task's own priority list, these were explicitly lower priority than the critical
path above, and every one of them is additive — a new reserved route proxied to a specific
backend (`keep`, `herald`, `web`, `lookout`) — rather than something the core gate/OAuth2/proxy
machinery needs in place first. Concretely, what's missing to implement them:

- **020/021/027** need a RabbitMQ publisher (`lapin`, already identified in `tech-stack.md` as
  portcullis's AMQP client) and/or an internal-JWT-authenticated local route — straightforward
  additions on top of the existing gate/JWT code, not attempted here for time.
- **022/026** are the simplest deferred stories (unauthenticated passthrough to `keep`/`herald`)
  but still need a second SPIFFE-mTLS-authenticated `reqwest` client wired up (see "Known gap:
  east-west mTLS" below) to be done for real rather than faked.
- **023/024/025** all depend on `webUpstream` proxying to `web` plus (024) a second pending-link
  cookie flow and (025) prefix-based multi-backend routing analogous to what
  `authstar-proxy::proxy::routing` already does for tenant upstreams — architecturally
  straightforward given the existing `RouteResolver`, just not built.
- **011a** (WebSocket) needs a real bidirectional byte-passthrough implementation once the
  upstream responds `101` — a materially different code path from the buffered-body HTTP proxy
  `proxy_handler` implements, and the design's own story explicitly separated it into its own
  file for exactly this reason. A `Connection: Upgrade` request reaching the current
  `proxy_handler` is forwarded as an ordinary buffered HTTP request, which will simply fail
  against an upstream expecting a real handshake — it does not crash portcullis itself, but it
  doesn't work either.

---

## Real signet integration

This was **actually run**, not just written and left unverified. Summary of what was done and
found (full reproduction steps below, since the live registration was cleaned up afterward — see
"Cleanup" at the end of this section):

1. Found an already-running `k3d` cluster (`signet-smoke`, from the `signet-smoke-test` project
   at `~/git/signet-smoke-test`) with a real signet + SPIRE installation already healthy —
   `kluster up --profile signet` was not needed from scratch since this environment already had
   one.
2. Registered a new namespace/ServiceAccount (`smoke-portcullis`/`portcullis`) — auto-covered by
   the cluster's existing wildcard `ClusterSPIFFEID` (`spiffe://smoke.cluster.local/ns/{ns}/sa/{sa}`),
   no manual SPIRE registration entry needed.
3. Authored a config document (`config/smoke-portcullis/portcullis.yaml`, matching
   `authstar_config::bundle::Bundle`'s shape) and four secrets (`signet secret set`, SOPS-
   encrypted) for a one-tenant bundle, committed and pushed to the already-registered git repo,
   then `signet repo sync`'d.
4. Built `crates/authstar-config/examples/signet_smoke.rs` — a small binary that does exactly
   what portcullis's own `main.rs` does at startup: `BootstrapEnv::from_env()`, `SignetSource::
   dial` (real SPIFFE mTLS), `.fetch()` (real `GetServiceBundle`), asserts on the decoded
   config/secrets, then also exercises `wait_for_restart`'s restart-lock RPC path. Packaged into
   a throwaway Docker image (`crates/authstar-config/examples/Dockerfile.smoke`), imported
   directly into the k3d node's containerd (`ctr images import`, no registry needed), run as a
   Kubernetes `Job` with the `csi.spiffe.io` volume mounted exactly like `signet-smoke-test`'s
   own `echo-rust.yaml` manifest.
5. **First run failed** — see "Real bug #1" below. Fixed, rebuilt, redeployed, **passed**:

```
SMOKE: dialing signet at signet.signet.svc.cluster.local:8443 (namespace=smoke-portcullis, service=portcullis, trust_domain=smoke.cluster.local)
SMOKE: SPIFFE mTLS connection established
SMOKE: fetched bundle, config_version=2, tenants=1
SMOKE: tenant 'acme' present, cookie.domain=app.acme.test, 1 application(s), 1 provider(s)
SMOKE: decoded tenant-acme-session-key secret, looks like a PEM private key (240 bytes)
SMOKE: session key parses as a real ES256 keypair
```

6. Extended the smoke test to also exercise the restart-lock RPC path (`wait_for_restart`), which
   surfaced **anomaly #2** below (documented, not root-caused — see that section for why it
   doesn't compromise portcullis's own shutdown correctness despite being a real, reproducible
   observation).

### Real bug #1 — protobuf `Struct` has no integer type, breaking `u64` bundle fields

`google.protobuf.Struct`'s `number_value` is *always* a double — there is no integer variant in
the wire format at all. A config value authored as plain YAML `timeout: 30` therefore comes back
from `GetServiceBundle` as the float `30.0`. The first version of `struct_json.rs`'s conversion
(`Number::from_f64`) preserved that as a JSON *float*, and `serde_json`'s strict-by-default
integer deserialization rejected it outright against every `u64`/`u32` bundle field
(`timeout`, `maxAge`, `version`, …):

```
SMOKE_FAIL: GetServiceBundle failed: parse bundle config: invalid type: floating point `30.0`, expected u64
```

This is a real bug that **only shows up against a real signet fetch** — every unit/behavior test
in this repo builds its test bundles directly as `serde_json::json!{...}` literals, where a bare
`30` is already a JSON integer, so nothing in the fake-backed test suite could have caught this;
only a real `GetServiceBundle` round-trip exercises the actual `prost_types::Struct` -> JSON
conversion path. Fixed in `crates/authstar-config/src/struct_json.rs`'s `number_to_json`: a
whole-number float is now converted to a JSON integer (covering every realistic bundle field —
durations, counts, versions are always whole numbers in this domain), with a regression test
(`whole_number_float_deserializes_as_u64`) and a genuinely-fractional-value test proving that
case still round-trips as a float. Verified fixed by rebuilding and rerunning against the live
cluster (output above).

### Anomaly #2 — `wait_for_restart` did not return promptly after cancellation, in live testing

With a real signet connection (not the `signet-client` crate's own fake-stream unit tests), the
smoke test raced `wait_for_restart(ttl, debounce, cancel)` against a timer that calls
`cancel.cancel()` after 3 seconds. `cancel.is_cancelled()` reported `true` immediately after that
call, but `wait_for_restart` itself did not return — a 20-second `tokio::time::timeout` wrapped
around the call also elapsed:

```
SMOKE: about to call wait_for_restart at 9.625µs
SMOKE: cancel timer fired at 3.002235543s
SMOKE: cancel.cancel() called, is_cancelled=true
SMOKE_FAIL: wait_for_restart did not return within 20s of a 3s cancellation (elapsed 20.002898926s)
```

Reading `signet-client`'s `restart.rs` source, the cancellation path *looks* correct on paper —
`watch_loop`'s inner loop races `cancel.cancelled()` against `stream.recv()` via `tokio::select!`,
and its own fake-stream unit tests (`watch_loop_coalesces_rapid_changes`, etc.) pass. This pass
did **not** fully root-cause why the real gRPC/SPIFFE-mTLS-backed stream behaves differently —
that would need isolating `watch_bundle` directly from `wait_for_restart`'s additional debounce
logic, which wasn't reached given the time budget for this task. This is reported as an honest,
reproducible **observation**, not a fix — worth filing against `signet-clients` upstream.

**Why this doesn't compromise portcullis's own shutdown correctness** despite being real: look at
`authstar-proxy/src/main.rs`'s actual shutdown race —

```rust
tokio::select! {
    result = server => { ... }        // axum's own graceful shutdown, listening on `cancel`
    result = restart_wait => { ... }  // wait_for_restart(..., cancel.clone())
}
```

Both branches share the *same* `cancel` token. On `SIGTERM`, `cancel.cancel()` fires; axum's
`with_graceful_shutdown` (the `server` branch) is a separate, independently-tested code path that
reacts to the same signal promptly, and `tokio::select!` takes whichever branch resolves first
and **drops** the other — so even if `restart_wait` would have hung exactly as observed above,
portcullis's own signal-driven shutdown does not wait on it. The hang would only matter for a
caller that awaits `wait_for_restart` directly with no sibling future racing the same
cancellation — which portcullis's `main.rs` deliberately doesn't do, precisely because it always
races both under the same `select!`.

### Cleanup

The live registration was reverted after this pass to leave `signet-smoke-test`'s cluster and
git repo as found: the Kubernetes `Job` and `smoke-portcullis` namespace were deleted, the
config/secrets commit was `git revert`'d and pushed, and `signet repo sync` was re-run to remove
them from signet's live state. The `authstar-config/examples/signet_smoke.rs` binary and
`Dockerfile.smoke` are left in this repo as a ready-to-rerun reproduction — to redo this
end-to-end verification:

```bash
kluster up --profile signet --name dev-signet   # or reuse any existing signet+SPIRE cluster
# ... register a namespace/ServiceAccount, author config+secrets via `signet secret set` +
#     `signet repo sync` (see this section's numbered steps above for the exact shape) ...
docker build -f crates/authstar-config/examples/Dockerfile.smoke -t portcullis-signet-smoke .
docker save portcullis-signet-smoke | docker exec -i <k3d-server-container> ctr -n k8s.io images import -
kubectl apply -f <a Job manifest matching signet-smoke-test/manifests/echo-rust.yaml's shape>
kubectl logs job/portcullis-signet-smoke
```

---

## East-west mTLS for tower (fixed this pass; keep/herald/lookout/web still to come)

**Previously a known gap** (see git history for the original writeup): the `reqwest::Client`
`authstar-proxy/src/main.rs` used for tower calls was plain TLS, not SPIFFE mTLS. This pass
replaced it with a real SPIFFE mTLS client, reusing the same `signet-client` already-a-dependency
crate's underlying `spiffe`/`spiffe-rustls` crates portcullis already pulls in (via
`signet-client`'s `spiffe-workload` feature) for its own signet connection.

### What changed

- **`crates/authstar-config/src/mtls.rs`** (new module) — `dial_east_west_client_config` opens a
  second, independent SPIFFE Workload API connection (same socket, same portcullis SVID
  underneath, just a second `spiffe::X509Source` — `dial_workload`'s own `X509Source` is entirely
  internal to `signet-client` and never exposed) and builds a `rustls::ClientConfig` via
  `spiffe_rustls::mtls_client(source)`, closely mirroring `dial_workload`'s own implementation in
  `signet-client/src/client.rs`: same `authorizer::trust_domains([td])` +
  `TrustDomainPolicy::LocalOnly(td)` policy (accept any SPIFFE ID within portcullis's own trust
  domain, not one specific expected identity for tower — see "Judgment calls" below for why).
  `http_client_from_tls_config` then wires that `rustls::ClientConfig` into a `reqwest::Client`
  via `ClientBuilder::use_preconfigured_tls(...)`, the officially supported way to hand `reqwest`
  a caller-built TLS config.
- **`authstar-proxy/src/main.rs`** now builds *two* `reqwest::Client`s at startup: the original
  plain-TLS `http_client` (still used for 3rd-party OIDC discovery/token/userinfo calls — those
  can never be SPIFFE mTLS, they're Google/etc., not another authstar workload) and a new
  `tower_http_client` built via `authstar_config::mtls::dial_east_west_http_client`. Failure to
  build the mTLS client is fatal (`exit(1)`), matching the signet dial's own treatment — both
  depend on the same SPIFFE Workload API socket for the same underlying reason (portcullis's own
  identity), so if the mTLS client can't be built, the signet dial already would have failed
  first.
- **`authstar-middleware`**: `PortcullisState` gained a `tower_http_client` field, threaded
  through `build_state`, and `oauth/callback.rs`'s `/identities/resolve` call now uses it instead
  of the OIDC-only `http_client`. `TowerClaimsEnricher`'s `/enrich` call already had its own
  `client` field — it's now constructed from `tower_http_client` instead of the shared
  `http_client`. The `Allow`/`Deny`/`Unreachable` outcome-handling logic in `enricher.rs` and
  `identities.rs` is untouched — this was purely a transport-security change.

### How this was verified — precisely

- **Real, not mocked**: `crates/authstar-config/tests/mtls_integration_tests.rs` (3 tests) spins
  up a genuine loopback `TcpListener`, performs a genuine `rustls` mutual-TLS handshake via
  `tokio-rustls`, and drives a genuine HTTP/1.1 request/response round trip through `reqwest` —
  against the exact function (`http_client_from_tls_config`) production code calls. One test
  proves the full round trip succeeds (client presents its cert, both sides validate the other's
  cert against a shared CA); one proves the server genuinely rejects a client that presents no
  certificate; one proves the client genuinely rejects a server certificate chaining to an
  untrusted CA. The certs are hand-built with `rcgen`, carrying SPIFFE-shaped URI SANs (e.g.
  `spiffe://test.example/tower`), and verified with `rustls`'s standard
  `WebPkiClientVerifier`/`WebPkiServerVerifier` — genuine X.509 chain validation, genuine mTLS
  enforcement, genuine reqwest/rustls transport plumbing.
- **Not verified live**: `dial_east_west_client_config` itself — the half that sources
  portcullis's own SVID from a live `spiffe::X509Source` and builds the SPIFFE-ID-aware verifier
  via `spiffe_rustls::mtls_client` — has no `#[test]` coverage, for the identical reason
  `SignetSource::dial` doesn't either: it needs the real SPIFFE Workload API socket, which only
  exists inside a pod with the `csi.spiffe.io` CSI volume mounted. This is the same class of gap
  the "Real signet integration" section above already lives with, just not (yet) lifted the same
  way — the `signet_smoke.rs` live-cluster run above proved `dial_workload`'s equivalent
  gRPC/tonic path works against real signet+SPIRE; extending that smoke test (or a sibling
  binary) to also exercise `dial_east_west_client_config` against a mock or real tower listener
  presenting a live SPIRE-issued SVID is the natural next step, not attempted in this pass.
- **Tower's own side is entirely unverified, by design**: tower is being built concurrently by a
  different agent and, as of this pass, almost certainly has no SPIFFE-terminated TLS on its own
  HTTP listener yet (plain HTTP, or none of `/enrich`/`/identities/resolve` even existing yet).
  Nothing in this pass depends on tower's server-side TLS termination being real — the client-side
  wiring is complete and independently verified as above, ready to point at tower's real listener
  once tower terminates SPIFFE mTLS itself. Until then, a real deployed portcullis pointed at a
  real (non-mTLS) tower would fail every enrichment/identity-resolve call at the TLS handshake
  (tower's plain-HTTP listener won't complete a TLS handshake at all) — this surfaces as
  `Unreachable`, which existing fail-open-by-default handling already degrades gracefully from
  (see "Fail-open only" in Judgment calls below), not a crash.
- **keep/herald/lookout/web** still use no client of their own yet (022/026/023/025 are deferred,
  per the coverage table above) — `authstar_config::mtls` is written generically enough
  (`dial_east_west_http_client(env, timeout)`) that wiring any of them up later is a call site, not
  new plumbing.

---

## Judgment calls made without a settled wire contract

The design-story digest available while building this service was extremely detailed on
*behavior* (exact status codes, header names, cookie names, claim names) but occasionally silent
on byte-for-byte wire contracts this implementation still needed to pick something concrete for.
Every one of these is called out in a doc comment at its point of use; collected here for one
place to review them all:

- **Tower's `/enrich` and `/identities/resolve` response shapes**
  (`authstar-middleware/src/enricher.rs`, `identities.rs`): the three-outcome *behavior*
  (`Allow`/`Deny`/`Unreachable`) and their fields are exactly per Stories 010/013/015, but the
  literal HTTP status/body mapping (`200` -> `Allow`, any other status -> `Deny{status, reason}`,
  connection failure -> `Unreachable`) is this pass's own reasonable contract, isolated in
  `parse_enrich_response` for easy adjustment.
- **OAuth2 provider client secrets live in signet's `secrets` map**, not the plain bundle config
  (`authstar-config/src/secrets.rs::provider_client_secret_name`) — despite one digest's prose
  grouping "clientId/clientSecret/discoveryUrl/scope" together as one thing, an OAuth2 client
  secret is unambiguously a secret, and putting it in plain config would defeat the entire point
  of this rewrite.
- **A `towerUpstream` bundle field**, alongside the story-documented `webUpstream` — portcullis's
  whole claims-enrichment design requires knowing tower's address, and Story 001 is explicit that
  signet's bundle is the *only* configuration source, so this couldn't be a bootstrap env var
  either. Follows `webUpstream`'s own precedent rather than inventing a different mechanism.
- **Tenant `status: deleted`** is treated identically to "host not found" (`404`), distinct from
  `suspended`'s `503` — the stories spell out `suspended`'s response precisely but never named
  `deleted`'s.
- **Tower's east-west mTLS authorization is trust-domain-wide, not identity-specific**
  (`authstar-config/src/mtls.rs`) — `dial_east_west_client_config` accepts any SPIFFE ID within
  portcullis's own trust domain (`authorizer::trust_domains([td])` +
  `TrustDomainPolicy::LocalOnly(td)`), the same policy `dial_workload` itself uses for signet,
  rather than an exact-match allow-list naming tower's specific SPIFFE ID. Nothing in the bundle
  schema (`bundle.rs`'s `tower_upstream` field) carries tower's expected SPIFFE ID today, and
  ADR 0001 doesn't specify one either — tightening this to `authorizer::exact([tower's SPIFFE
  ID])` once that's available is a one-line change isolated to this function.
- **Fail-open only** for `Unreachable` enrichment outcomes (`gate.rs`) — Stories 010/013 describe
  *both* fail-open and fail-closed behavior in detail but never name the config key that chooses
  between them per tenant/app; implementing an unconfigurable fail-closed mode would have been
  worse than clearly documenting the simplification.
- **No key-rotation overlap** for session/internal signing keys (`keys.rs`) — the bundle secret
  shape gives exactly one secret name per key purpose per tenant (unlike the identity-hash key,
  which has explicit `-<version>` generations), so there's no second "previous key" to verify
  against during a rotation window. Rotation instead happens via the same restart-triggered
  bundle refetch every other config change uses.
- **`LISTEN_PORT = 3710`** is a fixed constant (`authstar-proxy/src/main.rs`), not bundle-driven
  — the bundle shape has per-application `server.publicUrl` (externally-visible) but no
  portcullis-internal bind-port field, matching `ref-proxy`'s own default.
- **Identity-hash key retention validation** (`authstar-config/src/validate.rs`) only checks the
  obvious failure mode (nonzero cookie lifetime with zero retained key generations) rather than a
  precise duration-vs-generation-count comparison — the bundle only gives a *count* of retained
  generations, not each one's rotation period, so the exact arithmetic Story 001's "retention
  window must cover cookie.maxAge" requirement implies isn't fully checkable from the bundle
  shape alone.
- **Request/response body buffering, not streaming**, in `authstar-proxy/src/proxy/mod.rs` —
  matches `ref-proxy`'s own documented behavior exactly (confirmed in the ref-proxy digest this
  pass was built from); a real streaming proxy would avoid buffering full bodies in memory, left
  as future work consistent with not being a regression from the reference implementation.

## A real bug found in the fake-backed integration tests (not the live signet run)

`wiremock::MockServer::drop` does **not** synchronously stop the server from accepting
connections — a test that dropped a `MockServer` and then expected the next request to it to
fail with connection-refused instead got a real (if unmocked, 404) response, because the
underlying listener was still alive. Fixed by pointing the "simulate an unreachable dependency"
test case at a port nothing listens on (`127.0.0.1:1`) instead of relying on server-drop timing —
see `unreachable_tower_fails_open_with_degraded_token` in
`crates/authstar-middleware/tests/integration_tests.rs`.
