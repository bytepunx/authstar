# ADR 0061: `web`'s Overview Screen

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)
- **Depends on:** [ADR 0060](0060-activity-feed-and-revenue-summary.md)

## Decision

### Three independent tiles, each shown or hidden by its own permission

Consistent with ADR 0049's degradation principle — Overview shows only what the authenticated
account can actually see, not an all-or-nothing gate:

- **Active Users** — `analytics:read`. The same `active-users` report endpoint and rendering
  logic as the Analytics section (ADR 0059), scaled down (a headline number plus a small
  sparkline, not the full chart) — one mechanism, a leaner view of it, not a second
  implementation.
- **Revenue Summary** — `billing:read`. MRR, active-subscription count, status breakdown
  (`keep`'s new `revenue-summary` endpoint, ADR 0060).
- **Recent Activity** — `activity:read`. The last ~20 entries from the merged tower/keep/herald
  activity feed (ADR 0060), including any operator-driven actions with their "acting as" label.

### Each tile links to its fuller section

Active Users → the Analytics section's own Active Users screen. Revenue Summary → Billing.
Recent Activity → a "view all" activity browse screen, using the same endpoints with full
pagination rather than the tile's small default page.

### Not a BI tool

No new metrics, no configurable widgets, no drag-and-drop layout — three fixed tiles and links
out to the sections that already own deeper analysis. Consistent with ADR 0049's original
framing of Overview as lean, not a dashboard-building product.

## Consequences

- No new backend mechanism beyond ADR 0060 — this section is a straightforward consumer of it.

## Related

- [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0059](0059-web-analytics-screens.md), [ADR 0060](0060-activity-feed-and-revenue-summary.md)
