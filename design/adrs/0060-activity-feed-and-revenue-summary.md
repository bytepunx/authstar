---
id: ADR-0060
title: Cross-Service Activity Feed and Keep's Revenue Summary
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0060: Cross-Service Activity Feed and Keep's Revenue Summary

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, keep, herald
- **Extends:** [ADR 0048](0048-steward-ux.md) (tenant-scoped activity, mirroring its operator-scoped precedent)
- **Resolves gaps found while designing:** [ADR 0061](0061-web-overview-screen.md)

## Context

`web`'s Overview needs "recent activity across services" and a "revenue summary," per ADR 0049.
Neither had a real data source. Activity existed only as an operator-scoped, tower-only route
(ADR 0048); revenue is uncomputable because `keep` has never stored a price amount anywhere —
Stripe owns pricing entirely, and nothing in `planMapping` (ADR 0038/0046) caches it.

## Decision

Tenant-scoped activity, mirroring ADR 0048's operator-scoped precedent — now in three services.

### Tenant-scoped activity, mirroring ADR 0048's operator-scoped precedent — now in three services

`GET /tenants/{tenantSlug}/activity` added to **tower, keep, and herald** — each surfacing its
own consequent event history (already inherent to every actor in this design) in a shared
response shape: `{ timestamp, actorType, actorId, eventType, summary }`. Paginated — a small
default page serves the Overview tile, full pagination serves a "view all" browse screen.
Gated by a new, deliberately **coarse** `activity:read` permission — one gate for the whole
merged feed, not per-entry filtering matched against the viewer's other specific permissions.
Stated as a real trade-off, not a free simplification: fine-grained, per-entry visibility is a
plausible future enhancement if coarse-grained turns out to leak more than intended, but the
activity feed is fundamentally lower-sensitivity than the underlying entities it summarizes
("X happened at time Y," not the target's actual field values), which makes the simpler choice
defensible for now.

**A nice emergent property, not a new mechanism**: `steward`'s operator-driven actions already
record the "acting as" attribution label at write time (ADR 0048). Since those actions land in
the same tower event log a tenant's own activity feed reads from, a tenant admin naturally sees
when/why an operator intervened (e.g., a bootstrap or recovery permission grant) — falls out of
what was already designed, nothing new to build for it.

`web` calls all three services' activity endpoints and merges/sorts the results — the same
BFF-aggregation pattern already established for data export (ADR 0056), not a new one.

### Keep gains cached pricing data and a revenue-summary endpoint

`planMapping` gains `unitAmount`, `currency`, `interval` (`month`/`year`) — populated from
Stripe (the tenant's own key, already held per ADR 0046/0052) at create/edit time, and kept
current by a periodic re-sync job (same operational shape as ADR 0029's retention sweep and
ADR 0033's retry sweep) to catch price changes made directly in Stripe rather than through
`keep`. **Stripe remains the authoritative source** — this is a display/computation cache, the
same "cache derived data for cheap reads" pattern already used for tower's application/role
reference cache in `keep` (ADR 0047).

New `GET /tenants/{tenantSlug}/revenue-summary`:

```json
{
  "mrr": { "amount": 0, "currency": "usd" },
  "activeSubscriptions": 0,
  "byStatus": { "active": 0, "pastDue": 0, "canceled": 0, "trialing": 0 },
  "byPlan": [ { "planMappingId": "", "name": "", "count": 0 } ]
}
```

MRR normalizes yearly-interval plans to their monthly equivalent — real aggregation logic that
belongs in `keep` (which owns the underlying data and relationships), not something `web` should
reimplement client-side.

Gated by a new `billing:read` permission, distinct from `billing:manage` — viewing a revenue
summary shouldn't require the ability to edit plans or Stripe configuration, the same
least-privilege precision already applied repeatedly (`roles:manage` vs. `permissions:manage`,
`contacts:read` vs. `contacts:export`).

## Consequences

- Tower, keep, and herald each gain the `activity` route; keep additionally gains
  `revenue-summary` and the pricing-cache fields/sync job on `planMapping`.
- Two new permissions (`activity:read`, `billing:read`) added to ADR 0051's consolidated catalog.
- ADR 0048's tower-only, operator-scoped activity route is now one of four activity surfaces
  (three tenant-scoped, one operator-scoped) sharing the same response shape.

## Related

- [ADR 0029](0029-herald-payload-retention.md), [ADR 0033](0033-herald-send-worker-and-retry.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0048](0048-steward-ux.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0056](0056-gdpr-data-export.md)
