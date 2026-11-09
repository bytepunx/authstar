---
id: D-0020
title: "Cost of delay inputs for S-0015: recommedation"
kind: answer
sources: [TH-0013]
topics: [herald, node, keep, steward, sveltekit, web, code, all]
paths: [design/adrs/0111-node-services-verify-tower-against-the-spire-trust-bundle.md, design/adrs/README.md, design/tech/tech-stack.md, herald/src/lib/tower-tls.ts, herald/src/server.ts, herald/spec/behavior/tower-tls.spec.ts, herald/spec/lib/spiffe-test-certs.ts, herald/package.json, herald/package-lock.json, herald/TESTING.md, keep/src/lib/tower-tls.ts, keep/src/server.ts, keep/src/lib/role-reference-backfill.ts, keep/spec/behavior/tower-tls.spec.ts, keep/spec/lib/spiffe-test-certs.ts, keep/package.json, keep/package-lock.json, keep/TESTING.md, steward/src/lib/server/tower-tls.ts, steward/src/hooks.server.ts, steward/tests/behavior/tower-tls.spec.ts, steward/tests/helpers/spiffe-test-certs.ts, steward/package.json, steward/package-lock.json, steward/TESTING.md, web/src/lib/server/tower-tls.ts, web/src/hooks.server.ts, web/spec/behavior/tower-tls.spec.ts, web/spec/fixtures/spiffe-test-certs.ts, web/package.json, web/package-lock.json, web/TESTING.md, chart/values.yaml, chart/README.md, design/stories/chart/001-chart-layout-and-provisioning-hook.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0020 Cost of delay inputs for S-0015: recommedation

The operator chose the planner's recommended cost of delay inputs for S-0015: `penalty_per_week` 200 and no revenue. The planner's alternatives, `penalty_per_week` 500 or `time_lost_per_cycle` 1h, were not taken.

The planner's reason, on TH-0013: "The story makes no new revenue. Its cost is risk: herald, keep, steward, and web turn off TLS verification for the whole process, so any outbound HTTPS call they make, Stripe and signet included, would accept a forged certificate."

The operator answered at 2026-11-06T18:19:30Z: "recommedation", read as the recommendation. S-0015 has no epic, so the inputs belong on the story; it carried none yet when this entry was written.

Source: TH-0013.
