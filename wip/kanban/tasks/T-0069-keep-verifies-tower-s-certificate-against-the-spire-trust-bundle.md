---
id: T-0069
type: task
nature: remediation
title: Keep verifies tower's certificate against the SPIRE trust bundle
status: backlog
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:10:04Z
updated: 2026-11-06T18:10:04Z
transitions: []
stream: S-0015
tags: [keep, spiffe, mtls]
touches: [keep/src/lib/tower-tls.ts, keep/src/server.ts, keep/src/lib/role-reference-backfill.ts, keep/spec/behavior/tower-tls.spec.ts, keep/spec/lib/spiffe-test-certs.ts, keep/package.json, keep/package-lock.json, keep/TESTING.md]
after: [T-0054]
---
# T-0069 Keep verifies tower's certificate against the SPIRE trust bundle

## Work

Keep calls tower over TLS in two places, and both work only because the chart turns verification off for the whole process: the tenant-domain lookup in `keep/src/server.ts`, and the role-reference backfill's `fetch()` of applications and role definitions in `keep/src/lib/role-reference-backfill.ts`.

- Add `keep/src/lib/tower-tls.ts`, as the ADR of T-0054 says: an `undici` `Agent` whose `ca` is the Workload API's X.509 bundle, refreshed when it rotates, and whose `checkServerIdentity` accepts only tower's SPIFFE ID. For an `http://` base URL it returns no agent.
- Build the agent once in `keep/src/server.ts`, pass it as the `dispatcher` of the tenant-domain lookup, hand it to the backfill client, and close it on shutdown. Let the backfill client take an optional dispatcher, so its existing specs stand unchanged.
- Add `undici` and `spiffe` to keep's dependencies and `@peculiar/x509` to its dev dependencies.
- Add `keep/spec/lib/spiffe-test-certs.ts`, a CA and URI-SAN leaf generator like `tower/spec/lib/spiffe-test-certs.ts`, and `keep/spec/behavior/tower-tls.spec.ts`. The spec serves HTTPS on a real socket with a leaf for tower's SPIFFE ID and proves, with `NODE_TLS_REJECT_UNAUTHORIZED` unset, that the agent connects with the bundle; that it refuses a leaf from another CA; and that it refuses a leaf for another SPIFFE ID. It also drives the backfill client through the agent once.
- List the new spec in `keep/TESTING.md`.

It waits for T-0054, whose ADR fixes the agent's shape. It shares no path with the herald, steward, and web tasks, so the four service tasks run together.

## Done when

- Both of keep's calls to tower pass the agent, and no keep code sets or reads `NODE_TLS_REJECT_UNAUTHORIZED`.
- `keep/spec/behavior/tower-tls.spec.ts` proves the three cases above and the backfill call.
- `npm run build` and `npm run test:behavior` pass in `keep/`.

## Notes
