---
id: D-0021
title: "Plan for S-0015: seven tasks in four layers: 4 copies for now with a follow up story to remediate this later"
kind: answer
sources: [TH-0026]
topics: [herald, node, keep, steward, sveltekit, web, code, all]
paths: [design/adrs/0111-node-services-verify-tower-against-the-spire-trust-bundle.md, design/adrs/README.md, design/tech/tech-stack.md, herald/src/lib/tower-tls.ts, herald/src/server.ts, herald/spec/behavior/tower-tls.spec.ts, herald/spec/lib/spiffe-test-certs.ts, herald/package.json, herald/package-lock.json, herald/TESTING.md, keep/src/lib/tower-tls.ts, keep/src/server.ts, keep/src/lib/role-reference-backfill.ts, keep/spec/behavior/tower-tls.spec.ts, keep/spec/lib/spiffe-test-certs.ts, keep/package.json, keep/package-lock.json, keep/TESTING.md, steward/src/lib/server/tower-tls.ts, steward/src/hooks.server.ts, steward/tests/behavior/tower-tls.spec.ts, steward/tests/helpers/spiffe-test-certs.ts, steward/package.json, steward/package-lock.json, steward/TESTING.md, web/src/lib/server/tower-tls.ts, web/src/hooks.server.ts, web/spec/behavior/tower-tls.spec.ts, web/spec/fixtures/spiffe-test-certs.ts, web/package.json, web/package-lock.json, web/TESTING.md, chart/values.yaml, chart/README.md, design/stories/chart/001-chart-layout-and-provisioning-hook.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0021 Plan for S-0015: seven tasks in four layers: 4 copies for now with a follow up story to remediate this later

For S-0015, each Node service that calls tower (herald, keep, steward, web) gets its own copy of the small module that builds tower's TLS agent, not a shared package; a follow-up story removes the copies later.

The planner's proposal on TH-0026: an `undici` `Agent` for tower's origin alone, trusting the SPIRE X.509 bundle from the Workload API and checking tower's SPIFFE ID in `checkServerIdentity`, because tower's SVID carries only a `spiffe://` URI SAN, which Node's hostname check does not read. The chart then drops `NODE_TLS_REJECT_UNAUTHORIZED`, which it sets on herald, keep, steward, and web, not on tower. It recommended four copies because no shared library for services exists and `clients/typescript/core` is the package tenants' applications use; one shared package would have shrunk the four service tasks to wiring.

The operator answered at 2026-11-06T18:20:52Z: "4 copies for now with a follow up story to remediate this later". A story that adds a fifth Node caller of tower, or touches one of the copies, should know the copies are meant to be merged.

Source: TH-0026.
