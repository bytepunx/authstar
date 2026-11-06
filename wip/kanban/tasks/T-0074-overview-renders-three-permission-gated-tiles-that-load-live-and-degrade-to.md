---
id: T-0074
type: task
nature: feature
title: Overview renders three permission-gated tiles that load live and degrade to unavailable
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:10:14Z
updated: 2026-11-06T18:10:14Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/src/routes/(admin)/+page.server.ts, web/src/routes/(admin)/+page.svelte, web/src/lib/components/ActiveUsersTile.svelte, web/src/lib/components/RevenueSummaryTile.svelte, web/src/lib/components/RecentActivityTile.svelte, web/spec/behavior/overview.spec.ts, web/spec/components/overview-tiles.spec.ts]
after: [T-0059, T-0065, T-0067]
---
# T-0074 Overview renders three permission-gated tiles that load live and degrade to unavailable

## Work

Add `web/src/routes/(admin)/+page.server.ts`. Its load returns one entry per tile the session's permissions allow, and leaves the others out (`design/stories/web/002-overview.md`, Layout).

| Tile | Permission | Source | Links to |
|------|------------|--------|----------|
| Active Users | `analytics:read` | `chronicle.getActiveUsers` for the current period, tenant-wide | `/analytics` |
| Revenue Summary | `billing:read` | `keep.getRevenueSummary` | the Billing section |
| Recent Activity | `activity:read` | `tower.listActivity`, about the last 20 entries | none until a "view all" screen exists |

- Return each tile's data as an unawaited promise, so SvelteKit streams it and the page shows a loading state first.
- Catch each source's failure inside its own promise and resolve it as `{ state: 'unavailable' }`, so one failing source never fails the page or another tile.
- Replace the section-link list in `web/src/routes/(admin)/+page.svelte` with the tiles, using `{#await}` for the loading, loaded, and unavailable states. An account with none of the three permissions sees an empty Overview, as story web/002 says.
- Add `ActiveUsersTile.svelte`, which renders `ActiveUsersChart` with `compact`, `RevenueSummaryTile.svelte`, and `RecentActivityTile.svelte` under `web/src/lib/components/`.

Waits for T-0059, T-0065, and T-0067: it calls the chronicle client, the two new client methods, and the compact chart.

## Done when

- [ ] `web/spec/behavior/overview.spec.ts`, against the fake clients, covers each tile:
  - present with data;
  - unavailable when its source throws;
  - absent without its permission.
- [ ] It also covers an account with no tile permission and one with all three where one source fails.
- [ ] `web/spec/components/overview-tiles.spec.ts` renders each tile's loading, loaded, and unavailable states.
- [ ] The tests pass through `flai test` once web's tiers are wired (I-0003), or else with `npm run test:behavior` and `npm run test:components` in `web`. `npm run check` in `web` is clean.

## Notes

S-0011's T-0027 filters the Overview's section list by the `built` flag. This task replaces that list with the tiles, since story web/002 gives the Overview only its three tiles.
