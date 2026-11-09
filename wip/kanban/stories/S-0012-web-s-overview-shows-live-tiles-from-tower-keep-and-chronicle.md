---
id: S-0012
type: story
nature: feature
title: Web's Overview shows live tiles from tower, keep, and chronicle
status: ready
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-09T21:56:04Z
transitions:
  - to: ready
    at: 2026-11-09T20:44:57Z
    by: bytepunx
tags: [web]
touches: [web/src/lib/server/clients/chronicle.ts, web/src/lib/server/config.ts, web/src/hooks.server.ts, web/src/app.d.ts, web/spec/fixtures/fake-chronicle-client.ts, web/spec/fixtures/fake-chronicle-server.ts, web/spec/integration/chronicle.integration.spec.ts, web/spec/behavior/config.spec.ts, integration/config/authstar/web.yaml, integration/manifests/16-web.yaml, docs/operators/index.md, web/src/lib/server/clients/keep.ts, web/src/lib/server/clients/tower.ts, web/spec/fixtures/fake-keep-client.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-server.ts, web/spec/fixtures/fake-tower-server.ts, web/spec/integration/overview-clients.integration.spec.ts, web/package.json, web/package-lock.json, design/tech/tech-stack.md, web/src/lib/components/ActiveUsersChart.svelte, web/src/lib/components/AuthFunnelChart.svelte, web/spec/components/active-users-chart.spec.ts, web/spec/components/auth-funnel-chart.spec.ts, web/src/routes/(admin)/+page.server.ts, web/src/routes/(admin)/+page.svelte, web/src/lib/components/ActiveUsersTile.svelte, web/src/lib/components/RevenueSummaryTile.svelte, web/src/lib/components/RecentActivityTile.svelte, web/spec/behavior/overview.spec.ts, web/spec/components/overview-tiles.spec.ts, web/src/routes/(admin)/analytics/+page.server.ts, web/src/routes/(admin)/analytics/+page.svelte, web/spec/behavior/analytics.spec.ts, web/spec/components/analytics-page.spec.ts, web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, integration/scripts/scenario-golden-path.sh, integration/README.md, web/TESTING.md, design/system/overview.md, design/stories/web/002-overview.md, docs/users/index.md]
after: [S-0009, S-0010, S-0011]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 4
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 3
          output: 22
          cache_read: 124483
          cache_write: 20033
          cost: 0.1602
cost_of_delay:
  value: 47.06
  by: planner-S-0012
  at: 2026-11-06T18:09:26Z
forecast:
  duration: 8h
  delivery: 2026-11-11T18:06:00Z
  basis: "Its own forecast of 8h; 4th in the pull order with an in-progress limit of 4, behind S-0006, S-0007, S-0008, S-0013, S-0005, S-0010 and S-0019."
  by: flai
  at: 2026-11-09T21:56:04Z
---
# S-0012 Web's Overview shows live tiles from tower, keep, and chronicle

## Goal

The Overview screen ADR-0061 and story web/002 describe shows the tenant's real numbers: accounts and applications from tower, subscription and revenue summary from keep, and the auth funnel and active users from chronicle, each tile degrading to an explicit "unavailable" when its source fails.

## Acceptance criteria
- [ ] Web has a chronicle client authenticated with the forwarded internal JWT
- [ ] The Overview renders the tiles story web/002 lists, each from its live source, with loading and unavailable states
- [ ] The analytics section renders chronicle's auth funnel and active users as charts
- [ ] Behavior tests against the fake backends cover every tile state; the integration harness shows non-zero funnel numbers after a scripted login

## Tasks
- T-0059 Web has a chronicle client that forwards the internal JWT
- T-0065 Keep and tower clients read the revenue summary and the activity feed
- T-0067 Web has a charting library and chart components for active users and the auth funnel
- T-0074 Overview renders three permission-gated tiles that load live and degrade to unavailable
- T-0078 Analytics section charts chronicle's auth funnel and active users
- T-0081 Golden path shows non-zero funnel numbers from its own scripted login, through web
- T-0082 Docs and design describe the live Overview and the Analytics section

## Notes

Waits for S-0009 and S-0010 so the numbers are real. Charting library choice is a `design/tech` entry.

### Planning

After:

- S-0009: web's chronicle client forwards the ES256 internal JWT portcullis mints, and S-0009 makes chronicle verify that token per tenant (`chronicle/src/lib/auth.ts`). Chronicle checks an HS256 shared secret until S-0009 lands. S-0009 also rewrites the golden path's chronicle step (T-0038), which the harness task here builds on.
- S-0010: the harness criterion needs portcullis to emit the scripted login's events to lookout. Today step 6 of `integration/scripts/scenario-golden-path.sh` posts a synthetic event instead.
- S-0011: its T-0027 adds the `built` flag to `AdminSection` in `web/src/lib/permissions.ts` and sets it false for `analytics`. This story's analytics task reads that flag and sets it true. Landing before S-0011 would let S-0011 hide the new section again.

Touches, by source:

- Design: ADR-0061 and `design/stories/web/002-overview.md` name the three tiles and their routes. ADR-0059 and `design/stories/web/007-analytics.md` name the analytics charts and the shared active-users call. The story's notes name the `design/tech` entry, which goes in `design/tech/tech-stack.md` under "web, steward (SvelteKit)".
- Layout:
  - Clients and wiring: `web/src/lib/server/clients/*.ts`, `web/src/hooks.server.ts`, `web/src/app.d.ts`, and `web/src/lib/server/config.ts`, after the existing tower and keep clients.
  - Fakes and specs: under `web/spec/` by tier, after `web/TESTING.md`.
  - Harness wiring: `integration/config/authstar/web.yaml` and `integration/manifests/16-web.yaml`.
  - Docs: `docs/operators/index.md` for the new chronicle URL setting.
- Co-change: `flai touches suggest` had nothing to start from, since the story declared no touches.
- Folder touches: none.

Figures:

- Forecast 8h, raised from the 1h default. One done story with usage is too little history. The work spans seven tasks: a new client, two client extensions, a charting dependency, three tiles, an analytics page, a live-harness step, and docs. S-0009 was planned at 6h for five tasks.
- Cost of delay 47.06 USD a week. This is `flai cod`'s share of E-0004's 100 USD a week from the operator's inputs: 8h of the 17h forecast across its three open stories without inputs. It stands unchanged.

Assumptions, open on the plan thread:

- The Recent Activity tile reads tower's activity feed alone. Keep and herald have no activity route, and adding them is backend work outside this web story.
- The goal's "accounts and applications from tower" is met by that tile. Tower has no counts route.
