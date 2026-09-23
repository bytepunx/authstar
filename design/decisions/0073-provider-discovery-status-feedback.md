# ADR 0073: Provider Discovery Status Feedback

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** portcullis, tower, web
- **Resolves the open item in:** [ADR 0051](0051-web-applications-and-identity-access-screens.md), [Story 004](../stories/proxy/004-oidc-discovery.md)

## Context

Story 004 already handles discovery failure gracefully at the request-serving level — a broken
`discoveryUrl` marks that provider unavailable for that tenant, no login-path 404, no crash —
but the result never leaves portcullis's own process memory. ADR 0051 named the resulting gap
plainly: "an admin can configure a broken `discoveryUrl` with no way to learn it's not working
short of a user reporting a broken login." No write-back path from portcullis to tower exists
today at all — portcullis's only outbound channel is analytics, to lookout/chronicle, a
different system entirely, built for event counts, not "is this resource currently healthy."

## Decision

### A new, narrow write-back path: `POST /provider-discovery-status`

Sits on the same portcullis-mTLS-authenticated surface as enrichment and
[ADR 0070](0070-self-service-identity-linking.md)'s `POST /identity-links` (ADR 0030's third
auth model) — the established trust boundary for portcullis-only calls, no new one invented.
Body: `{ tenant, provider: name, status: 'ok' | 'unavailable', checkedAt, error }` — `error` is
the same coarse, non-sensitive category Story 004 already logs (network error / non-2xx /
timeout / missing endpoint), never the raw upstream response, consistent with ADR 0003's posture
on what's safe to surface. Dispatched fire-and-forget, the same way portcullis→lookout calls
are (ADR 0035) — a failure to *report* status must never affect discovery or login itself, the
same non-critical-path posture Story 004 already established for discovery itself.

### Reported only on transition, not on every check

Portcullis calls this only when a provider's discovery result **differs** from the last one it
observed (first-ever check counts as a transition) — not on every startup/restart for a provider
that's still fine. This keeps the volume low and, more importantly, keeps whatever consumes it
meaningful: a healthy provider that's been healthy for months shouldn't generate an event every
time the pod restarts.

### Tower materializes it as a `provider` event, not a new actor

A `provider.discovery-unavailable` / `provider.discovery-recovered` event on the existing
`provider` actor (keyed the same way, no new business key), carrying `checkedAt`/`error`. This
is data *about* an existing tenant-authored resource, not a new domain concept — same
distinction already drawn elsewhere in this design between admin-authored config and
system-observed state about it (e.g. `contact` vs. `account`). The provider's `GET` response
gains a `discoveryStatus: { status, checkedAt, error }` field, sourced from the latest such
event — no new route, just an extended shape on the route ADR 0051 already designed.

### Surfaced two ways, no new mechanism for either

- **`web`'s Providers screen** (ADR 0051, Identity & Access) shows the status inline per
  provider — "healthy," or "discovery failing since {checkedAt}" — directly from the extended
  `GET` shape above.
- **The tenant activity feed** (ADR 0060) picks these events up for free — they're ordinary
  `provider` actor events, and the feed already aggregates across actor types with no
  per-eventType allowlist. A transition to `unavailable` is exactly the kind of admin-relevant
  signal that feed exists for; reporting only on transition (above) is what keeps this from
  drowning out everything else in it.

### Explicitly not designed here

- **Proactive alerting** (e.g. a herald email to admins the moment every provider for a tenant
  goes unavailable — a total-lockout state as serious in kind as ADR 0062's suspension
  scenario). A visible status indicator plus an activity-feed entry fully resolves the stated
  gap ("no way to learn it's not working"); push notification is a reasonable future
  enhancement, not required to close it.
- **Staleness between restarts.** Story 004 already established no periodic re-check outside
  the bundle-change-triggered restart cycle — a provider that breaks mid-life without any bundle
  change stays reported healthy until the next restart happens to re-check it. Named honestly as
  an inherited limitation, not newly introduced or silently fixed here; periodic health-check
  polling would be a separate, larger addition to Story 004 itself.

## Consequences

- New portcullis→tower write-back call, new tower route on the mTLS surface.
- `provider` actor gains a new event type and a materialized `discoveryStatus` field.
- `web`'s existing Providers screen and Activity feed both pick this up with no new UI
  mechanism, just an extended data shape.

## Related

- [ADR 0003](0003-enrichment-outcome-response-contract.md), [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0060](0060-activity-feed-and-revenue-summary.md), [ADR 0070](0070-self-service-identity-linking.md), [Story 004](../stories/proxy/004-oidc-discovery.md)
