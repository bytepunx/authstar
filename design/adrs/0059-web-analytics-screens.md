---
id: ADR-0059
title: "`web`'s Analytics Screens"
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0059: `web`'s Analytics Screens

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)
- **Depends on:** [ADR 0058](0058-analytics-event-shape-corrections.md)

## Decision

Three screens.

### Three screens

- **Auth Funnel** — the `auth-funnel` report (ADR 0036): attempts/success/failure by provider
  (now meaningful per ADR 0058's `idp` field), failure breakdown by `reason` category, signup
  conversion (`signup-completed` ÷ `login-succeeded`), invite/code redemption rates. Date range
  and optional application filter.
- **Active Users** — the `active-users` report: DAU/WAU/MAU, granularity toggle, optional
  application filter. **The same endpoint, called the same way**, backs both this screen and the
  Overview section's summary tile (ADR 0049) — one mechanism, two renderings, not two separate
  implementations of the same metric.
- **Explore** — a UI over the constrained query endpoint (`metric`/`eventType`/`groupBy`/
  `filters`/`dateRange`, ADR 0036) for anything the two purpose-built reports don't cover.

### Deliberate scope boundary: no person-level lookup here

The query endpoint's `groupBy`/`filters` vocabulary (`application`, `eventType`, `day`/`week`/
`month`, `status`, `method`) has no identity dimension, and that's intentional, not a gap to
fill — chronicle deliberately never sees `contactId` (ADR 0035), and "get one specific person's
activity summary" is already solved by the data-export flow (ADR 0056), which resolves the
right `identityHash` values through tower first. Analytics stays scoped to aggregate,
business-metric queries; person-level lookups belong to Privacy & Compliance.

### Two small, honest UX additions

- **CSV export** on any report/query result — a `web`-side rendering concern (chronicle already
  returns structured JSON), not a new backend capability, so no mechanism design needed here.
- **"Data as of ~X minutes ago" indicator** — chronicle batches writes for ClickHouse performance
  (not one insert per event), so analytics is never truly real-time. Surfacing this plainly
  avoids an admin mistaking normal batching delay for something broken.

### Permission gap found and closed

Chronicle's report and query endpoints (ADR 0036) were never given an explicit permission name
— the only section with no entry in the consolidated catalog (ADR 0051). Adds `analytics:read`.

## Consequences

- ADR 0051's permissions catalog gains `analytics:read`.
- No new chronicle mechanism beyond ADR 0058's event-shape fixes — this section is otherwise a
  straightforward consumer of what ADR 0036 already specified.

## Related

- [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md), [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0056](0056-gdpr-data-export.md), [ADR 0058](0058-analytics-event-shape-corrections.md)
