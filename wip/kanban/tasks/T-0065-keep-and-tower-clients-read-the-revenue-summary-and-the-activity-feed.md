---
id: T-0065
type: task
nature: feature
title: Keep and tower clients read the revenue summary and the activity feed
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:09:55Z
updated: 2026-11-06T18:09:55Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/src/lib/server/clients/keep.ts, web/src/lib/server/clients/tower.ts, web/spec/fixtures/fake-keep-client.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-server.ts, web/spec/fixtures/fake-tower-server.ts, web/spec/integration/overview-clients.integration.spec.ts]
---
# T-0065 Keep and tower clients read the revenue summary and the activity feed

## Work

- Add `getRevenueSummary(tenantSlug)` to `KeepClient` in `web/src/lib/server/clients/keep.ts`.
  - It calls `GET /tenants/{tenantSlug}/revenue-summary`, which `keep/src/routes/billing-reads.ts` serves under `billing:read`.
  - It returns `{ mrr, activeCount, byStatus, byPlan }`.
- Add `listActivity(tenantSlug, { limit })` to `TowerClient` in `web/src/lib/server/clients/tower.ts`.
  - It calls `GET /tenants/{tenantSlug}/activity`, which `tower/src/routes/activity.ts` serves under `activity:read`.
  - It returns the feed entries in tower's shape, including the "acting as" label ADR-0061 names.
- Extend the fakes in `web/spec/fixtures/fake-keep-client.ts` and `fake-tower-client.ts` with both methods. Each can be set to return data or to throw.
- Add the activity route to `web/spec/fixtures/fake-tower-server.ts`. Add `web/spec/fixtures/fake-keep-server.ts`, a `node:http` server serving the revenue summary.

This task waits for no other: it changes only the two existing clients and their fakes.

## Done when

- [ ] `web/spec/integration/overview-clients.integration.spec.ts` shows both methods send the forwarded bearer token, call the routes above, and parse the fake servers' responses.
- [ ] The existing behavior specs that use the two fakes still pass.
- [ ] The tests pass through `flai test` once web's tiers are wired (I-0003), or else with `npm run test:behavior` and `npm run test:integration` in `web`. `npm run check` in `web` is clean.

## Notes

Keep and herald serve no activity route yet. The tile reads tower's feed alone, as the story's Planning notes assume.
