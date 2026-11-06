---
id: T-0056
type: task
nature: remediation
title: Herald verifies tower's certificate against the SPIRE trust bundle
status: backlog
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:09:23Z
updated: 2026-11-06T18:09:30Z
transitions: []
stream: S-0015
tags: [herald, spiffe, mtls]
touches: [herald/src/lib/tower-tls.ts, herald/src/server.ts, herald/spec/behavior/tower-tls.spec.ts, herald/spec/lib/spiffe-test-certs.ts, herald/package.json, herald/package-lock.json, herald/TESTING.md]
after: [T-0054]
---
# T-0056 Herald verifies tower's certificate against the SPIRE trust bundle

## Work

Herald's tenant-domain lookup in `herald/src/server.ts`, a plain `fetch()` of `${towerBaseUrl}/tenants/${tenantSlug}`, reaches tower over TLS only because the chart turns verification off for the whole process.

- Add `herald/src/lib/tower-tls.ts`, as the ADR of T-0054 says: an `undici` `Agent` whose `ca` is the Workload API's X.509 bundle, refreshed when it rotates, and whose `checkServerIdentity` accepts only tower's SPIFFE ID. For an `http://` base URL it returns no agent.
- Pass the agent as the `dispatcher` of that `fetch` in `herald/src/server.ts`, and close it on shutdown.
- Add `undici` and `spiffe` to herald's dependencies and `@peculiar/x509` to its dev dependencies.
- Add `herald/spec/lib/spiffe-test-certs.ts`, a CA and URI-SAN leaf generator like `tower/spec/lib/spiffe-test-certs.ts`, and `herald/spec/behavior/tower-tls.spec.ts`. The spec serves HTTPS on a real socket with a leaf for tower's SPIFFE ID and proves, with `NODE_TLS_REJECT_UNAUTHORIZED` unset, that the agent connects with the bundle; that it refuses a leaf from another CA; and that it refuses a leaf for another SPIFFE ID.
- List the new spec in `herald/TESTING.md`.

It waits for T-0054, whose ADR fixes the agent's shape. It shares no path with the keep, steward, and web tasks, so the four service tasks run together.

## Done when

- Herald's call to tower passes the agent, and no herald code sets or reads `NODE_TLS_REJECT_UNAUTHORIZED`.
- `herald/spec/behavior/tower-tls.spec.ts` proves the three cases above.
- `npm run build` and `npm run test:behavior` pass in `herald/`.

## Notes
