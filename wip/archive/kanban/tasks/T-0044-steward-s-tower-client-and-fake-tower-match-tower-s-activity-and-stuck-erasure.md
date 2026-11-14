---
id: T-0044
type: task
nature: feature
title: Steward's tower client and fake tower match tower's activity and stuck-erasure contracts
status: done
parent: S-0013
owner: bytepunx
created: 2026-11-06T18:07:49Z
updated: 2026-11-09T20:59:28Z
transitions:
  - to: ready
    at: 2026-11-09T20:45:39Z
    by: agent-S-0013
  - to: in-progress
    at: 2026-11-09T20:45:39Z
    by: agent-S-0013
  - to: done
    at: 2026-11-09T20:59:28Z
    by: agent-S-0013
stream: S-0013
tags: [steward]
touches: [steward/src/lib/server/tower-client.ts, steward/src/lib/types.ts, steward/tests/helpers/fake-backend-server.ts, steward/tests/integration/api-wire.integration.spec.ts]
usage:
  source: log
  seconds: 829
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 80
      output: 18396
      cache_read: 5383133
      cache_write: 317598
      cost: 3.7042
---
# T-0044 Steward's tower client and fake tower match tower's activity and stuck-erasure contracts

## Work

This task waits for no other task. The proxy routes and screens read the types and the fake tower it writes.

Tower's routes exist already. Planning checked them, and this task confirms them against tower's source before it changes anything:

- `GET /operator/tenants/:tenantSlug/activity` is at `tower/src/routes/activity.ts:72`. It reads `limit` (1 to 200, default 50) and `cursor`. It answers `{ data: ActivityEntry[], nextCursor: string | null }` (`tower/src/lib/activity-feed.ts`), and 404 for an unknown tenant.
- `GET /operator/erasure-requests/stuck` is at `tower/src/routes/operator.ts:85`. It reads `olderThanHours` (default 72). It answers a bare array of `{ tenant, contactId, requestedAt, outstandingServices }`, oldest first.

Steward was written against an earlier draft of these contracts:

- In `steward/src/lib/server/tower-client.ts`, make `getActivity` send `limit` and `cursor` instead of `sinceEventId` and `until`.
- In `steward/src/lib/types.ts`, make `ActivityListResponse` `{ data, nextCursor }`. Make `StuckErasureRequest` `{ tenant, contactId, requestedAt, outstandingServices }`, and have `getStuckErasureRequests` return an array of it. Drop `StuckErasureRequestsResponse`, `expectedServices`, and `missingServices`.
- In `steward/tests/helpers/fake-backend-server.ts`, serve both routes behind the existing token check, with tower's shapes:
  - Activity: seed entries for `acme`, one with an `actingAs` label and one without. Seed none for `globex`. Answer 404 for an unknown tenant.
  - Stuck: seed pending requests for both `acme` and `globex`, with different ages and different outstanding services. Filter them by `olderThanHours`, as tower does.
- In `steward/tests/integration/api-wire.integration.spec.ts`, cover both client methods against the fake backend: the shapes, the query parameters, and the 404.

## Done when

- [ ] The client's two methods and their types match tower's routes as named above.
- [ ] The fake tower serves both routes with tower's shapes, and its seeds include an `acme` feed, an empty `globex` feed, and stuck requests in two tenants.
- [ ] `npm run test:integration` and `npm run typecheck` pass in `steward`, run through `flai test` when a tier covers steward.

## Notes

The stale comments in tower that say the stuck route is missing (`tower/src/routes/erasure-requests.ts`, `tower/src/actors/erasure_request_actor.ts`, `tower/TESTING.md`) are outside this story. The plan thread proposes them as an addition.
