# ADR 0001: Claims Enrichment via Tower

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** portcullis, tower, keep

## Context

The reference proxy implementation (`~/git/authstar/ref-proxy`) defines a `ClaimsEnricher`
extension point: an async trait called on every authenticated request, after session JWT
verification and before the internal (60-second) upstream token is signed. Its return value
is merged into the internal token as extra claims. In the reference it is a no-op
(`NoopEnricher`) — real behavior was always meant to be supplied by the consumer.

For authstar, "the consumer" is tower. This ADR settles how portcullis's enricher integrates
with tower (and, indirectly, keep) to give upstream applications a streamlined identity and
authorization experience without embedding tower/keep-specific logic in every adopting app.

Four coupled questions had to be resolved together because each constrains the others: what
the enricher is allowed to call, how enrichment data stays fresh without paying a tower round
trip's worst-case latency and availability on every proxied request, how tower/enrichment
failures are handled, and how a person's identity is represented when they can authenticate
via more than one OIDC provider.

## Decision

### Scope: enricher calls tower only

Portcullis's `ClaimsEnricher` implementation calls tower's HTTP API exclusively. It never
calls keep, and never reads tower's (or any) database or cache directly.

Keep publishes async messages that tower consumes to update its materialized user records
(e.g. a non-payment threshold being crossed). This keeps portcullis's only upstream dependency
as tower, and keeps entitlement/billing logic entirely inside keep and tower — portcullis has
no opinion on keep's data model.

The keep → tower messaging mechanism itself (queue, webhook, outbox pattern via consequent) is
a separate design question for when keep and tower are designed; it is a hard dependency of
this decision's correctness (stale keep data flows through as stale claims) but not resolved
here.

### Caching and invalidation: owned entirely by tower

Because the enricher only calls tower's API, all caching lives inside tower: materialized user
records are fronted by a TTL cache (valkey/redis), invalidated early on specific domain events
(account locked, non-payment threshold crossed, role changed, etc.). Portcullis has no cache
or database access of its own for this data — every enrichment call is a live HTTP call to
tower, and it is tower's responsibility to make that call cheap.

This **supersedes** the note in the workspace-level `claude.md` stating portcullis needs "the
ability to read from a postgres database and optionally configured volatile cache" — that
line predates this decision and should be corrected to remove portcullis's direct DB/cache
access.

### Failure handling: three-way outcome, configurable only for infra failure

`enrich()` (or its real replacement) returns one of three outcomes, not a bare value:

```
enum EnrichOutcome {
    Allow(Value),                          // extra claims; request proceeds
    Deny { status: u16, reason: String },  // tower's explicit decision — always enforced
    Unreachable(Error),                    // infra failure — subject to configured policy
}
```

`Deny` (tower explicitly says no — locked account, expired entitlement, etc.) is always
enforced regardless of configuration; it is a real decision, not a failure. `Unreachable`
(tower is down or times out) is subject to a **per-application, configurable** fail-open /
fail-closed policy — not every application adopting authstar warrants failing closed, but it
must be available when desired. This requires a new config section (see Consequences).

### Identity resolution: OIDC provider subject, not email, is the resolution key

OIDC userinfo responses include `sub` — the provider's immutable opaque subject identifier —
in addition to `email`. Email is mutable and not a safe key for resolving or linking accounts
across providers; `sub` is.

- The session JWT keeps `sub = email` (readability, logging, JWT convention) and gains two new
  claims: `idp` (provider key, e.g. `google`) and `idp_sub` (the provider's opaque subject).
  Email is not dropped.
- `EnrichmentContext` carries `{ idp, idp_sub, email }`. Tower resolves the canonical internal
  account from `(idp, idp_sub)`; `email` is passed only as a hint tower can use to suggest
  account-linking ("this email matches an existing account signed in via a different
  provider").
- The internal (upstream-facing) token carries tower's resolved **canonical internal id** as
  part of the enriched claims. This — not the session cookie's `sub` — is the identity
  upstream applications should trust. Portcullis's login/callback flow never calls tower; all
  identity resolution happens per-request, in the enricher, consistent with the scope decision
  above.

## Consequences

Story-level changes required against the `ref-design` proxy stories as a starting point for
the real `stories/proxy/` specs in this repo:

- **Story 006** (OAuth2 callback / userinfo fetch) — capture `sub` from the userinfo response
  alongside `email`.
- **Story 008** (JWT session cookie issuance) — add `idp` and `idp_sub` claims to the session
  JWT; `sub` remains `email`.
- **Story 009** (JWT verification) — decoded session payload exposed to downstream logic must
  include `idp` and `idp_sub`, not just `sub`.
- **Story 010** (internal JWT generation) — internal token's identity claims come from tower's
  resolved canonical id (via enrichment), not directly from the session cookie.
- **Story 013** (authentication gate) — the gate's decision flow must branch on the three-way
  `EnrichOutcome` (Allow / Deny / Unreachable) instead of unconditionally proceeding with
  whatever claims are returned.
- **Story 001/002** (configuration) — new `tower` config section: base URL, request timeout,
  and the fail-open/fail-closed default for `Unreachable` outcomes.

## Open Research Items

- **Per-session revocation.** Account-level lock/suspend is already covered — enrichment
  runs on every authenticated request, so a `Deny` outcome takes effect on the very next
  request regardless of how much of the session JWT's 7-day lifetime remains. Not covered:
  killing one specific *session* (e.g. "log out this device") while the account stays valid.
  Since JWTs are stateless by design, this likely needs a `jti` claim plus a revocation set
  (valkey) checked at session verification (Story 009) — a stateful check, but a cheap one.
  Needs its own research spike before committing to an approach.

## Related

- Reference implementation: `~/git/authstar/ref-proxy/crates/authstar-middleware/src/enricher.rs`,
  `gate.rs`, `jwt/internal.rs`, `state.rs`
- Reference stories: `~/git/authstar/ref-design/stories/proxy/006`, `008`, `009`, `010`, `013`
