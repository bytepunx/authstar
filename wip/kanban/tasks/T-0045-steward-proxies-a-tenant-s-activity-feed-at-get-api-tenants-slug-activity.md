---
id: T-0045
type: task
nature: feature
title: "Steward proxies a tenant's activity feed at GET /api/tenants/[slug]/activity"
status: done
parent: S-0013
owner: bytepunx
created: 2026-11-06T18:08:02Z
updated: 2026-11-09T21:07:56Z
transitions:
  - to: ready
    at: 2026-11-09T20:59:33Z
    by: agent-S-0013
  - to: in-progress
    at: 2026-11-09T20:59:33Z
    by: agent-S-0013
  - to: done
    at: 2026-11-09T21:07:56Z
    by: agent-S-0013
stream: S-0013
tags: [steward]
touches: ["steward/src/routes/api/tenants/[slug]/activity/+server.ts", steward/tests/behavior/activity.spec.ts]
after: [T-0044]
usage:
  source: log
  seconds: 503
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 19
      output: 4678
      cache_read: 1303427
      cache_write: 43651
      cost: 0.6286
---
# T-0045 Steward proxies a tenant's activity feed at GET /api/tenants/[slug]/activity

## Work

This task waits for T-0044, because it calls `getActivity` with the arguments and types T-0044 sets.

- Add `steward/src/routes/api/tenants/[slug]/activity/+server.ts`. Copy the shape of `steward/src/routes/api/tenants/[slug]/accounts/+server.ts`: `extractOperatorAuth`, `createTowerClient`, `getActivity`, and `respondFromBackend`. Pass `limit` and `cursor` from the query string through to tower. Leave them out when they are absent.
- Add `steward/tests/behavior/activity.spec.ts`, written like `steward/tests/behavior/admin-access.spec.ts` with `fakeEvent` and `makeFakeFetch`. It covers:
  - a page passed through with `data` and `nextCursor`
  - `limit` and `cursor` forwarded to tower's URL
  - a missing operator token refused as the other routes refuse it
  - tower's 404 and a 5xx or unreachable tower, answered as `respondFromBackend` answers them

## Done when

- [ ] `GET /api/tenants/acme/activity` returns tower's page unchanged.
- [ ] The behavior tests above pass with `npm run test:behavior` in `steward`, run through `flai test` when a tier covers steward.

## Notes

It can run alongside T-0046, the stuck-erasure proxy, because the two share no file.
