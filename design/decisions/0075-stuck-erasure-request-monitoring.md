# ADR 0075: Stuck Erasure Request Monitoring

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** tower, steward, web
- **Resolves the flagged gap in:** [ADR 0055](0055-web-privacy-compliance-screens.md)

## Context

`erasureRequest` (ADR 0026) stays `status: "pending"` indefinitely if any service on the fixed
expected-services list never acknowledges — there's no timeout, retry, or dead-letter path, by
design (async, eventual completion is the whole point). ADR 0055 already surfaces
`expectedServices` alongside `acknowledgedBy` specifically so a caller can diff the two, but
explicitly declined to design any staleness indicator or alerting, calling it "an
operational/observability concern, not a `web` screen-design one."

## Decision

### `web`'s existing erasure-requests list gains a passive staleness indicator — no new data needed

The diff machinery ADR 0055 already put on the wire (`expectedServices` vs. `acknowledgedBy`,
plus `requestedAt`) is sufficient — `web` computes "pending longer than {N} hours" client-side
and flags it visually. No new tower field, no new route: this closes the literal "web
screen-design" half of the gap with data that already exists.

### A new operator-facing, cross-tenant view closes the actual "operational/observability" half

The part ADR 0055 correctly identified as not belonging in a single-tenant `web` screen: an
operator needs to see stuck requests **across every tenant** to know if this is a broader
problem (e.g. one expected service silently failing to consume its queue at all, stalling every
tenant's requests). New operator route, same bearer-token model as every other `steward`-facing
call (ADR 0021/0048):

```
GET /operator/erasure-requests/stuck?olderThanHours=72
```

`olderThanHours` is a query-time parameter, not a persisted config knob — an operator adjusts it
at query time rather than needing a new installation-level setting for a threshold that's really
just "how do I want to slice this right now." Default `72` is a reasonable starting point, not a
claimed-correct SLA figure. Response: tenant, `contactId`, `requestedAt`, and which specific
services in `expectedServices` haven't acknowledged — the part that actually helps an operator
diagnose *which* service is the problem, not just that one exists.

`steward` gains a new view surfacing this — a natural sibling to its existing Activity view
(ADR 0048), reusing the same connect/bearer-token session.

## Consequences

- New tower operator route.
- `web`'s existing erasure-requests screen gains a client-side-computed visual flag, no backend
  change.
- `steward` gains one new view.
- True paging/alerting (e.g. a metric an operator's monitoring stack scrapes) remains out of
  scope — this gives an operator a place to *look*, not a push notification; escalating further
  is infrastructure-level work outside this design's scope, same boundary ADR 0055 already drew.

## Related

- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0048](0048-steward-ux.md), [ADR 0055](0055-web-privacy-compliance-screens.md)
