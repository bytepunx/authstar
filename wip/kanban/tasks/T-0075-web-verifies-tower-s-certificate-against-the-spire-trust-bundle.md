---
id: T-0075
type: task
nature: remediation
title: Web verifies tower's certificate against the SPIRE trust bundle
status: backlog
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:10:18Z
updated: 2026-11-06T18:10:18Z
transitions: []
stream: S-0015
tags: [web, spiffe, mtls]
touches: [web/src/lib/server/tower-tls.ts, web/src/hooks.server.ts, web/spec/behavior/tower-tls.spec.ts, web/spec/fixtures/spiffe-test-certs.ts, web/package.json, web/package-lock.json, web/TESTING.md]
after: [T-0054]
---
# T-0075 Web verifies tower's certificate against the SPIRE trust bundle

## Work

Web calls tower over TLS in two ways, and both work only because the chart turns verification off for the whole process: the tenant-domain lookup, a plain `fetch()` in `web/src/hooks.server.ts`, and every server load and action, through `createTowerClient` with `event.fetch` (`web/src/lib/server/clients/tower.ts`).

- Add `web/src/lib/server/tower-tls.ts`, as the ADR of T-0054 says: an `undici` `Agent` whose `ca` is the Workload API's X.509 bundle, refreshed when it rotates, and whose `checkServerIdentity` accepts only tower's SPIFFE ID. For an `http://` tower URL it returns no agent.
- In `web/src/hooks.server.ts`, build the agent once the config is resolved, pass it as the `dispatcher` of the tenant-domain lookup, and add a `handleFetch` that sends each request to tower's origin through it. Requests to keep, which is plain HTTP, and to any other origin pass through untouched. The clients and routes stay as they are.
- Add `undici` and `spiffe` to web's dependencies and `@peculiar/x509` to its dev dependencies.
- Add `web/spec/fixtures/spiffe-test-certs.ts`, a CA and URI-SAN leaf generator like `tower/spec/lib/spiffe-test-certs.ts`, and `web/spec/behavior/tower-tls.spec.ts`. The spec serves HTTPS on a real socket with a leaf for tower's SPIFFE ID and proves, with `NODE_TLS_REJECT_UNAUTHORIZED` unset, that a request to tower's origin through `handleFetch` connects with the bundle; that it refuses a leaf from another CA; that it refuses a leaf for another SPIFFE ID; and that a request to keep's origin passes through untouched.
- List the new spec in `web/TESTING.md`.

It waits for T-0054, whose ADR fixes the agent's shape. It shares no path with the herald, keep, and steward tasks, so the four service tasks run together.

## Done when

- Every request web's server makes to tower's origin goes through the agent, and no web code sets or reads `NODE_TLS_REJECT_UNAUTHORIZED`.
- `web/spec/behavior/tower-tls.spec.ts` proves the four cases above.
- `npm run check`, `npm run build`, and `npm run test:behavior` pass in `web/`.

## Notes
