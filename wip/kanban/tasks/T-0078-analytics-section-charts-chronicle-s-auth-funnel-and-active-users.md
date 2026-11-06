---
id: T-0078
type: task
nature: feature
title: Analytics section charts chronicle's auth funnel and active users
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:10:29Z
updated: 2026-11-06T18:10:29Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/src/routes/(admin)/analytics/+page.server.ts, web/src/routes/(admin)/analytics/+page.svelte, web/src/lib/permissions.ts, web/spec/behavior/analytics.spec.ts, web/spec/components/analytics-page.spec.ts, web/spec/behavior/permissions.spec.ts]
after: [T-0059, T-0067]
---
# T-0078 Analytics section charts chronicle's auth funnel and active users

## Work

- Add `web/src/routes/(admin)/analytics/+page.server.ts`. It is gated by `analytics:read` and refuses the account without it, as the other `(admin)` sections do.
  - Its load calls `chronicle.getAuthFunnel` and `chronicle.getActiveUsers` for a date range and an optional application filter, both from the query string.
  - The range defaults to the last 30 days, and granularity to `day`.
  - It uses the same client method as the Overview tile (ADR-0059).
- Add `web/src/routes/(admin)/analytics/+page.svelte`.
  - It renders `AuthFunnelChart` and `ActiveUsersChart` at full size, with the granularity toggle and the date-range and application controls.
  - The active-users chart sits under an `id="active-users"` anchor for the Overview tile's link.
  - Show a source failure as "unavailable" on the chart it concerns.
- In `web/src/lib/permissions.ts`, set the `analytics` section's `built` flag, which S-0011's T-0027 adds, to true, so the nav lists the section.

Waits for T-0059 and T-0067: it calls the chronicle client and renders the two charts.

## Done when

- [ ] `web/spec/behavior/analytics.spec.ts`, against the fake chronicle client, covers:
  - the default range;
  - a range and application from the query;
  - a refusal without `analytics:read`;
  - an unavailable source.
- [ ] `web/spec/components/analytics-page.spec.ts` renders both charts from a fake report.
- [ ] `web/spec/behavior/permissions.spec.ts` shows an account with `analytics:read` sees the Analytics section.
- [ ] The tests pass through `flai test` once web's tiers are wired (I-0003), or else with `npm run test:behavior` and `npm run test:components` in `web`. `npm run check` in `web` is clean.

## Notes

Explore, CSV export, and the "data as of" indicator (ADR-0059) are outside this story's criteria. Leave them for a later story.
