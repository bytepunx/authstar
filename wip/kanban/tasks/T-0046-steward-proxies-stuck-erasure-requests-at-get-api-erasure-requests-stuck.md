---
id: T-0046
type: task
nature: feature
title: Steward proxies stuck erasure requests at GET /api/erasure-requests/stuck
status: backlog
parent: S-0013
owner: bytepunx
created: 2026-11-06T18:08:07Z
updated: 2026-11-06T18:08:07Z
transitions: []
stream: S-0013
tags: [steward]
touches: [steward/src/routes/api/erasure-requests/stuck/+server.ts, steward/tests/behavior/stuck-erasure-requests.spec.ts]
after: [T-0044]
---
# T-0046 Steward proxies stuck erasure requests at GET /api/erasure-requests/stuck

## Work

This task waits for T-0044, because it calls `getStuckErasureRequests` with the return type T-0044 sets.

The route is cross-tenant, as tower's is, so it serves the stuck view wherever TH-0016 places it.

- Add `steward/src/routes/api/erasure-requests/stuck/+server.ts`, with the same shape as `steward/src/routes/api/tenants/[slug]/accounts/+server.ts`. Read `olderThanHours` from the query string, defaulting to 72. Answer 400 without calling tower when it is not a positive integer.
- Add `steward/tests/behavior/stuck-erasure-requests.spec.ts`, written like `steward/tests/behavior/admin-access.spec.ts`. It covers:
  - tower's list passed through
  - the default of 72 and a given threshold forwarded to tower
  - an invalid threshold answered with 400 and no call to tower
  - a missing operator token refused
  - a 5xx or unreachable tower answered as `respondFromBackend` answers it

## Done when

- [ ] `GET /api/erasure-requests/stuck?olderThanHours=24` returns tower's list for that threshold.
- [ ] The behavior tests above pass with `npm run test:behavior` in `steward`, run through `flai test` when a tier covers steward.

## Notes

It can run alongside T-0045, the activity proxy, because the two share no file.
