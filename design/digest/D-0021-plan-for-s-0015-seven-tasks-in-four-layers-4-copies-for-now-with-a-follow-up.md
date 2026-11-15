---
id: D-0021
title: "Plan for S-0015: seven tasks in four layers: 4 copies for now with a follow up story to remediate this later"
kind: answer
sources: [TH-0026, S-0015]
topics: [herald, node, keep, chronicle, steward, sveltekit, web, tls, code, all]
paths: [design/adrs/0113-node-services-verify-tower-s-certificate-against-the-spire-trust-bundle-and-its.md, design/adrs/README.md, design/tech/tech-stack.md, herald/src/lib/tower-tls.ts, herald/spec/behavior/tower-tls.spec.ts, keep/src/lib/tower-tls.ts, keep/spec/behavior/tower-tls.spec.ts, chronicle/src/lib/tower-tls.ts, chronicle/spec/behavior/tower-tls.spec.ts, steward/src/lib/server/tower-tls.ts, steward/tests/behavior/tower-tls.spec.ts, web/src/lib/server/tower-tls.ts, web/spec/behavior/tower-tls.spec.ts, chart/values.yaml, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md]
date: 2026-11-06
status: absorbed
absorbed_by: "design/adrs/0113-node-services-verify-tower-s-certificate-against-the-spire-trust-bundle-and-its.md#decision"
asked_again: []
cited: [S-0015, T-0171, TH-0026]
---

# D-0021 Plan for S-0015: seven tasks in four layers: 4 copies for now with a follow up story to remediate this later

For S-0015, each Node service that calls tower (herald, keep, steward, web) gets its own copy of the small module that builds tower's TLS agent, not a shared package; a follow-up story removes the copies later.

The planner's proposal on TH-0026: an `undici` `Agent` for tower's origin alone, trusting the SPIRE X.509 bundle from the Workload API and checking tower's SPIFFE ID in `checkServerIdentity`, because tower's SVID carries only a `spiffe://` URI SAN, which Node's hostname check does not read. The chart then drops `NODE_TLS_REJECT_UNAUTHORIZED`, which it sets on herald, keep, steward, and web, not on tower. It recommended four copies because no shared library for services exists and `clients/typescript/core` is the package tenants' applications use; one shared package would have shrunk the four service tasks to wiring.

The operator answered at 2026-11-06T18:20:52Z: "4 copies for now with a follow up story to remediate this later". A story that adds a fifth Node caller of tower, or touches one of the copies, should know the copies are meant to be merged.

S-0015, accepted 2026-11-15, carried it out with five copies, not four: "Added T-0171 (chronicle's copy) ... The fifth copy follows the operator's four-copies answer on TH-0026 (D-0021)." It wrote "one reference module, cert helper, and spec ... and copied into each service, so the five copies stay identical", and built the module on `node:https` rather than the planned `undici` `Agent`. ADR-0113 records the decision, its five-name shape, and that "five copies of one module must change together until they are merged".

Source: TH-0026, S-0015.
