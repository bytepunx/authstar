# ADR 0035: `lookout` and `chronicle` — Portcullis-Sourced Analytics

- **Status:** Accepted (extended by [ADR 0058](0058-analytics-event-shape-corrections.md))
- **Date:** 2026-07-25
- **Affects:** portcullis, and two new services — `lookout`, `chronicle`

> **Extended 2026-08-01:** the auth-funnel report (ADR 0036) needed fields
> `analytics.auth.login-succeeded`/`login-failed` never specified (`idp`, a coarse `reason` on
> failure) and a new event, `analytics.auth.signup-completed`, to make "signup conversion"
> computable at all. See ADR 0058.

## Context

Portcullis sees every request that reaches an adopting application (with the standing caveat
that SPA-internal, non-network navigation and post-handshake WebSocket traffic are invisible to
it — ADR 011a). That position can replace a meaningful amount of third-party analytics tooling
and client-side embedded scripts, particularly for the auth funnel, which portcullis uniquely
owns end to end, and for cross-application rollups, which fall out naturally from tenant-scoped
identity resolution (ADR 0017) solving the exact deduplication problem that originally motivated
the application layer (ADR 0016).

## Decision

### Two new services: `lookout` (ingestion) and `chronicle` (storage/query)

Continuing the castle theme with roles rather than structures — a lookout watches and calls out
what's happening; a chronicle is the durable written record.

### `lookout` — stateless ingestion, two entry paths

No consequent, no database — its only job is validate → publish to RabbitMQ → done. This is a
deliberate departure from every other service in this system (tower/keep/herald all use
consequent+Postgres): not everything needs to be a domain-modeled actor system, and forcing a
thin relay into that shape would add nothing.

- **Server-side, from portcullis, on every (or sampled) API call.** Portcullis → lookout uses
  the same pattern as portcullis → tower: SPIFFE mTLS, service-to-service. Genuinely
  fire-and-forget at this hop, not just at the RabbitMQ-publish hop — portcullis spawns the call
  without awaiting it; on failure or timeout, it's dropped silently, no retry, no error-level
  logging. This must never add latency to, or cause a failure of, the actual proxied request.
- **Client-side, forwarded through portcullis**, not called directly by the browser — this is
  what lets portcullis attach server-verified identity rather than trusting client-asserted
  data. A new portcullis-reserved local route (not tenant-configured, not proxied upstream, the
  same category as `/oauth2/*`) accepts client-reported events and forwards them to lookout with
  identity attached from the verified session, if one exists.
- **The client-facing path gets defenses the server-side path doesn't need**: payload size caps,
  an allowlisted set of client-reportable event types (not arbitrary free-form event
  names/data), and rate limiting — it's accepting semi-trusted input, unlike the internal
  portcullis→lookout call.

### Identity is `identityHash`, never `accountId`

Resolving a true `accountId` requires a live tower enrichment call — adding that dependency here
would reintroduce exactly the hot-path coupling this pipeline exists to avoid. `identityHash`
(ADR 0027) is already available locally from the verified session JWT at zero network cost.
Known limitation: the same person authenticating via two different providers appears as two
distinct identities in analytics. **Unaffected by [ADR 0070](0070-self-service-identity-linking.md)'s**
self-service linking — a session's JWT still carries whichever `identityHash` that login used,
linked or not, and chronicle still only ever sees `identityHash`, never `accountId`, by design.
Linking makes the two identities the same *account* in tower; it does not make them the same
*identityHash* in any event, past or future. Closing this gap for real would mean chronicle
resolving `accountId` at ingest — the exact hot-path coupling this pipeline exists to avoid —
so it stays a deliberate, permanent trade-off, not a bug.

### No IP address, anywhere in this pipeline, ever

Not captured by portcullis, not published to RabbitMQ, not stored in `chronicle`. This is
unconditional — not truncated-for-geo, not hashed-for-privacy, simply never collected. (Raw
`User-Agent` should still be parsed into coarse categories — browser family, device type —
rather than stored verbatim, for the same fingerprinting-vector reasoning, though this is a
softer recommendation than the hard IP rule.)

### RabbitMQ contract: non-durable, a different reliability tier than everything else on this broker

Entitlement events, comms requests, contact-lifecycle messages are all low-frequency, must-not-
lose business events. Analytics is the opposite: potentially orders of magnitude higher volume,
and losing some during a brief `chronicle` outage is an acceptable, explicitly accepted trade-off
— not an oversight. Non-durable exchange/queue(s), no persistence guarantee if nothing is
consuming.

Event taxonomy, following the discrete-meaningful-events discipline from ADR 0031:

- `analytics.auth.<event>` — `login-succeeded`, `login-failed`, `logout`, `invite-redeemed` —
  low-volume, high-value, the auth-funnel data uniquely available from portcullis's position.
- `analytics.request` — general per-request telemetry (method, path, status, latency, tenant,
  application, `identityHash` if present) — higher volume.
- `analytics.client.<eventType>` — the allowlisted client-reported event types.

### `chronicle` — ClickHouse, no consequent, consumes the non-durable queues

**ClickHouse**, chosen over TimescaleDB or leaning on kluster's existing Loki/Grafana
provisioning — the workload (high-volume, aggregation-heavy, time-series-shaped queries) is
exactly what it's built for, at the cost of introducing a new database technology into a stack
that otherwise standardizes on Postgres (consequent) and CockroachDB (signet). No consequent —
no business invariants to enforce here, just "write what arrived, make it queryable."

**Erasure**: no separate cascade subscription needed. Analytics events reference `identityHash`
only, never anything from `contact` — the same opaque-reference pattern `identity`/`account`
already exhibit post-erasure (ADR 0023). Once a `contact` is deleted, an `identityHash`-tagged
analytics event is exactly as unresolvable to a real person as tower's own dead identity
pointers already are. This reasoning depends entirely on the no-IP rule holding — it's the
thing that would have complicated this otherwise.

**`chronicle`'s query/reporting API for `web`** is deferred to its own design pass, same
sequencing already used for tower and herald's API surfaces.

### Not the pipeline for billing-relevant usage metering

`lookout`/`chronicle` is a deliberately loss-tolerant pipeline (non-durable queues, dropped
events during an outage explicitly accepted above). Application-reported usage metering that
feeds real billing ([ADR 0043](0043-application-reported-usage-metering.md)) is the opposite —
losing an event there means undercharging or, on a naive retry, overcharging — and needs
durable delivery straight to `keep`, not this pipeline. The two were considered as one
mechanism and deliberately kept separate; see ADR 0043 for the reasoning.

### Explicitly still open, not blocking this architecture

- **Path normalization.** Portcullis doesn't know an upstream's route templates, so raw paths
  (`/users/12345/profile`) fragment aggregation by embedded IDs. Configurable templates
  (similar to exempt-route patterns) are a plausible fix, not designed here.
- **Sampling/granularity.** Full-fidelity vs. a configurable sampling rate per tenant/
  application — flagged as a tunable, not decided here (default assumed to be full fidelity).

## Consequences

- New portcullis story needed for the local client-ingestion route and the server-side
  fire-and-forget dispatch — written alongside this ADR.
- Two new repos eventually needed (`authstar-lookout`, `authstar-chronicle` or similar), not
  created yet.
- Root `claude.md`'s service list needs updating.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0027](0027-portcullis-computed-identity-hash.md), [ADR 0031](0031-keep-tower-entitlement-events.md) (discrete-event taxonomy pattern), [ADR 0015](0015-exempt-routes-never-blocked.md) (exempt/opportunistic-identity pattern reused here)
