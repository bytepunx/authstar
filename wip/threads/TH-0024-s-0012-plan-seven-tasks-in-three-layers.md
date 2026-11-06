---
id: TH-0024
title: "S-0012 plan: seven tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0012-web-s-overview-shows-live-tiles-from-tower-keep-and-chronicle.md
  item: S-0012
status: open
participants: [planner-S-0012]
created: 2026-11-06T18:10:58Z
updated: 2026-11-06T18:10:58Z
---

# TH-0024 S-0012 plan: seven tasks in three layers

On wip/kanban/stories/S-0012-web-s-overview-shows-live-tiles-from-tower-keep-and-chronicle.md.

## Entries

### 2026-11-06T18:10:58Z planner-S-0012
S-0012 is planned: seven tasks in three layers, forecast 8h, cost of delay 47.06 USD a week.

No thread named `asked` exists on S-0012, and the story had no tasks. This is its first plan.

## Tasks

| Layer | Task | Waits for |
|-------|------|-----------|
| 1 | T-0059 Web has a chronicle client that forwards the internal JWT | none |
| 1 | T-0065 Keep and tower clients read the revenue summary and the activity feed | none |
| 1 | T-0067 Web has a charting library and chart components | none |
| 2 | T-0074 Overview renders three permission-gated tiles, live, degrading to unavailable | T-0059, T-0065, T-0067 |
| 2 | T-0078 Analytics section charts the auth funnel and active users | T-0059, T-0067 |
| 3 | T-0081 Golden path shows non-zero funnel numbers from its scripted login, through web | T-0059, T-0078 |
| 3 | T-0082 Docs and design describe the live Overview and Analytics | T-0074, T-0078 |

The tasks in each layer share no path, so they can run together.

## Story changes

- Tagged `web`, with 44 file touches and no folder touches.
- `after` gains S-0011, besides S-0009 and S-0010.
  - S-0011's T-0027 adds the `built` flag in `web/src/lib/permissions.ts` and sets it false for analytics.
  - T-0078 sets it true.
  - If S-0012 landed first, S-0011 would hide the new section again.
- Forecast 8h, raised from the 1h default. Seven tasks; S-0009 was planned at 6h for five.
- Value 47.06 USD a week. This is `flai cod`'s share of E-0004's 100 USD a week, unchanged.

## Assumptions

1. Recent Activity reads tower's `GET /tenants/{slug}/activity` alone.
   - Keep and herald serve no activity route.
   - Story web/002 says the tile merges all three feeds.
   - Adding those routes is backend work for a story of its own, not this web story.
2. The goal's "accounts and applications from tower" is met through that activity tile. Tower has no counts route, and story web/002 and ADR-0061 list no counts tile.
3. Analytics covers the auth funnel and active users only. Explore, CSV export, and "data as of" (ADR-0059) are outside the criteria.
4. The charting library is the story agent's choice, recorded in `design/tech/tech-stack.md`.

## Proposed addition

A story for keep and herald to serve `GET /tenants/{slug}/activity` in tower's shape, so the tile can merge all three feeds as story web/002 asks. I have not drafted it. Say if you want it.
