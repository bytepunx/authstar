---
id: TH-0026
title: "Plan for S-0015: seven tasks in four layers"
anchor:
  path: wip/kanban/stories/S-0015-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md
  item: S-0015
status: answered
participants: [planner-S-0015, bytepunx]
created: 2026-11-06T18:12:04Z
updated: 2026-11-06T18:20:52Z
---

# TH-0026 Plan for S-0015: seven tasks in four layers

On wip/kanban/stories/S-0015-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md.

## Entries

### 2026-11-06T18:12:04Z planner-S-0015
S-0015 now has seven tasks in four layers. Its touches (37 files, no folders) and forecast (4h) are written. The cost of delay value waits on TH-0013.

## Proposed fix

Each Node service that calls tower gets an `undici` `Agent` for tower's origin alone. The agent trusts the SPIRE X.509 bundle from the Workload API and checks tower's SPIFFE ID in `checkServerIdentity`. The chart then drops `NODE_TLS_REJECT_UNAUTHORIZED`. Every other outbound call keeps Node's default verification.

The ID check is needed because tower's SVID carries only a `spiffe://` URI SAN, and Node's hostname check reads DNS and IP SANs only.

## Correction to I-0001

The chart sets the variable on herald, keep, steward, and web. It does not set it on tower, whose `extraEnv` is empty. The plan covers herald.

## Tasks and layers

| layer | task | what |
|---|---|---|
| 1 | T-0054 | ADR recording the fix and its alternatives; adds the new packages to `design/tech/tech-stack.md` |
| 2 | T-0056 | herald: agent, wiring in `herald/src/server.ts`, real-TLS spec |
| 2 | T-0069 | keep: agent for the tenant lookup and the role-reference backfill, real-TLS spec |
| 2 | T-0072 | steward: agent applied through a `handleFetch` in `steward/src/hooks.server.ts`, real-TLS spec |
| 2 | T-0075 | web: agent for the tenant lookup and through a `handleFetch` in `web/src/hooks.server.ts`, real-TLS spec |
| 3 | T-0077 | chart: remove the four entries; update `chart/README.md` and the chart design story |
| 4 | T-0079 | close I-0001 |

Layer 2 waits for the ADR's shape. Its four tasks share no path and run together. T-0077 waits for all four, because removing the variable earlier would break that service's calls to tower. T-0079 waits for T-0077.

## Assumptions

- Each service gets its own small module rather than a shared package. No shared library for services exists, and `clients/typescript/core` is the package tenants' applications use.
- An `http://` tower URL, as Env-Only Mode and the integration bundles use, takes no agent. The integration configs stay as they are.
- The tasks run `npm run test:behavior` in each service, since no test tier covers them (TH-0009, TH-0012).
- The ADR may not be numbered 0111, since 0107 to 0110 sit on other stories' branches. `flai task done` widens the touch.
- Portcullis (Rust) and tower's SVID rotation (S-0016) are out of scope.

## For you to decide

If you prefer one shared package for the agent over four copies, T-0054 would add a package and the four service tasks would shrink to wiring. I recommend the four copies for now.

### 2026-11-06T18:20:52Z bytepunx
4 copies for now with a follow up story to remediate this later
