---
id: TH-0017
title: "Plan for S-0016: four tasks in three layers to prove and close the SVID rotation fix"
anchor:
  path: wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md
  item: S-0016
status: open
participants: [planner-S-0016]
created: 2026-11-06T18:08:25Z
updated: 2026-11-06T18:08:25Z
---

# TH-0017 Plan for S-0016: four tasks in three layers to prove and close the SVID rotation fix

On wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md.

## Entries

### 2026-11-06T18:08:25Z planner-S-0016
S-0016 now has four tasks in three layers. The defect looks fixed in code already, so the plan proves the fix and closes I-0002 rather than building a new one.

## Proposed solution

Commit 5f77cad (2026-08-23) added `watchSVIDRotation` in `tower/src/lib/spiffe-mtls.ts`. It applies each SVID SPIRE pushes with `setSecureContext`, and `tower/src/server.ts` calls it after `listen()`. Nothing tests it, `tower/TESTING.md` still describes rotation by restart, and I-0002 and bytepunx/authstar-tower#4 are still open.

## Tasks

| layer | task | touches | after |
|---|---|---|---|
| 1 | T-0040 Make tower's SVID rotation watch injectable and stoppable | `tower/src/lib/spiffe-mtls.ts`, `tower/src/server.ts` | none |
| 2 | T-0041 Test that tower serves a rotated SVID on new mTLS handshakes | `tower/spec/behavior/spiffe-svid-rotation.spec.ts`, `tower/spec/lib/spiffe-test-certs.ts` | T-0040 |
| 2 | T-0042 Correct tower's TESTING.md on how the SVID rotates | `tower/TESTING.md` | T-0040 |
| 3 | T-0043 Close I-0002 naming the rotation fix and its test | `design/issues/I-0002-…md`, `design/issues/summary.md` | T-0041, T-0042 |

T-0041 and T-0042 share no path, so they run together.

## Figures

- Forecast: 2h, delivery 2026-11-07T01:48:00Z. That is flai's 1h default raised for the real-TLS test.
- Cost of delay: waits on your inputs on TH-0015.

## Assumptions

- The started prompt said to plan what you asked on a thread named "asked". No such thread exists on S-0016, and S-0016 had no earlier plan, so I planned it from scratch.
- The test reproduces the cause with an already-expired SVID and an injected push. A test against real SPIRE is out of scope.
- No test tier runs tower's tests (as TH-0009 and TH-0012 found for other services). The tasks use `npm run test:behavior` in `tower/`.
- Closing bytepunx/authstar-tower#4 on GitHub is yours. T-0043 asks you in the story's Notes.
- No `after` on another story. S-0015 covers the client side of the same mTLS link, but this story reads nothing from it.

Nothing to split, merge, or drop.
