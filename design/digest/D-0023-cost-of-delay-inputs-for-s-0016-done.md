---
id: D-0023
title: "Cost of delay inputs for S-0016: done"
kind: answer
sources: [TH-0015]
topics: [tower, node, code, all]
paths: [tower/src/lib/spiffe-mtls.ts, tower/src/server.ts, tower/spec/behavior/spiffe-svid-rotation.spec.ts, tower/spec/lib/spiffe-test-certs.ts, tower/TESTING.md, design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md, design/issues/summary.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0023 Cost of delay inputs for S-0016: done

The operator took the planner's recommended cost of delay inputs for S-0016 and set them on the story: `revenue_per_week` 0, `penalty_per_week` 25, no `time_lost_per_cycle` (set by alex at 2026-11-06T18:21:21Z).

The planner's reason, on TH-0015: commit 5f77cad already added `watchSVIDRotation` in `tower/src/lib/spiffe-mtls.ts`, called from `tower/src/server.ts`, so the defect looks fixed in code; what is left is a test and closing I-0002. A broken rotation would fail OAuth login for every tenant 4h after each tower restart, so a small penalty stands for that risk.

The operator answered at 2026-11-06T18:21:40Z: "done".

Source: TH-0015.
