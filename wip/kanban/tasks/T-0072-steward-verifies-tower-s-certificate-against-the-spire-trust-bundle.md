---
id: T-0072
type: task
nature: remediation
title: Steward verifies tower's certificate against the SPIRE trust bundle
status: backlog
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:10:11Z
updated: 2026-11-06T18:10:11Z
transitions: []
stream: S-0015
tags: [steward, spiffe, mtls]
touches: [steward/src/lib/server/tower-tls.ts, steward/src/hooks.server.ts, steward/tests/behavior/tower-tls.spec.ts, steward/tests/helpers/spiffe-test-certs.ts, steward/package.json, steward/package-lock.json, steward/TESTING.md]
after: [T-0054]
---
# T-0072 Steward verifies tower's certificate against the SPIRE trust bundle

## Work

Steward's API routes call tower through `createTowerClient` with `event.fetch`, and `steward/src/lib/server/backend-client.ts` makes the request. Against tower's `https://` URL it works only because the chart turns verification off for the whole process.

- Add `steward/src/lib/server/tower-tls.ts`, as the ADR of T-0054 says: an `undici` `Agent` whose `ca` is the Workload API's X.509 bundle, refreshed when it rotates, and whose `checkServerIdentity` accepts only tower's SPIFFE ID. For an `http://` tower URL it returns no agent.
- In `steward/src/hooks.server.ts`, build the agent in `init` once the env is resolved, and add a `handleFetch` that sends each request to tower's origin through it. The routes and `backend-client.ts` stay as they are.
- Add `undici` and `spiffe` to steward's dependencies and `@peculiar/x509` to its dev dependencies.
- Add `steward/tests/helpers/spiffe-test-certs.ts`, a CA and URI-SAN leaf generator like `tower/spec/lib/spiffe-test-certs.ts`, and `steward/tests/behavior/tower-tls.spec.ts`. The spec serves HTTPS on a real socket with a leaf for tower's SPIFFE ID and proves, with `NODE_TLS_REJECT_UNAUTHORIZED` unset, that a request to tower's origin through `handleFetch` connects with the bundle; that it refuses a leaf from another CA; that it refuses a leaf for another SPIFFE ID; and that a request to any other origin passes through untouched.
- List the new spec in `steward/TESTING.md`.

It waits for T-0054, whose ADR fixes the agent's shape. It shares no path with the herald, keep, and web tasks, so the four service tasks run together.

## Done when

- Every request steward makes to tower's origin goes through the agent, and no steward code sets or reads `NODE_TLS_REJECT_UNAUTHORIZED`.
- `steward/tests/behavior/tower-tls.spec.ts` proves the four cases above.
- `npm run check`, `npm run build`, and `npm run test:behavior` pass in `steward/`.

## Notes
