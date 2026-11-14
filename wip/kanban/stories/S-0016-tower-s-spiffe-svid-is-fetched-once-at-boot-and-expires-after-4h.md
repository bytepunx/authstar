---
id: S-0016
type: story
nature: remediation
title: Tower's SPIFFE SVID is fetched once at boot and expires after 4h
status: backlog
owner: bytepunx
created: 2026-11-06T17:38:17Z
updated: 2026-11-14T08:26:33Z
transitions: []
tags: [tower, spiffe, mtls]
touches: [tower/src/lib/spiffe-mtls.ts, tower/src/server.ts, tower/spec/behavior/spiffe-svid-rotation.spec.ts, tower/spec/lib/spiffe-test-certs.ts, tower/TESTING.md, design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md, design/issues/summary.md]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 298
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 222
          output: 684
          cache_read: 7216843
          cache_write: 730531
          cost: 0.5716
        - model: claude-opus-5-5
          input: 740
          output: 27894
          cache_read: 40145145
          cache_write: 627880
          cost: 13.3521
    - kind: orchestrator
      seconds: 66
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 49
          output: 343
          cache_read: 1415604
          cache_write: 199051
          cost: 1.8174
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 25
    by: alex
    at: 2026-11-06T18:21:21Z
forecast:
  duration: 2h
  delivery: 2026-11-15T05:00:00Z
  basis: "Its own forecast of 2h; 7th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0017, S-0012, S-0007, S-0008, S-0010, S-0014 and S-0015."
  by: flai
  at: 2026-11-14T08:26:33Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:06:37Z
---
# S-0016 Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Goal

This story remediates [I-0002](../../../design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md), "Tower's SPIFFE SVID is fetched once at boot and expires after 4h". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0002 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0002 is closed with `flai issue close I-0002 --reason` saying what fixed it

## Tasks
- T-0040 Make tower's SVID rotation watch injectable and stoppable
- T-0041 Test that tower serves a rotated SVID on new mTLS handshakes
- T-0042 Correct tower's TESTING.md on how the SVID rotates
- T-0043 Close I-0002 naming the rotation fix and its test

## Notes

### Planning

The proposed solution keeps the fix that is already in the code and proves it. Commit 5f77cad (2026-08-23) added `watchSVIDRotation` to `tower/src/lib/spiffe-mtls.ts`. It reads the Workload API's `FetchX509SVID` stream and calls `setSecureContext` on each push. `tower/src/server.ts` calls it after `listen()`. No test reaches it, `tower/TESTING.md` still says the SVID rotates only by restarting the process, and I-0002 and bytepunx/authstar-tower#4 are still open. The tasks make the watch testable and stoppable, reproduce the expiry in a real-TLS test, correct the docs, and close the issue.

Touches, all files, no folders:

| touch | source | why |
|---|---|---|
| `tower/src/lib/spiffe-mtls.ts` | layout | holds `fetchServerCredentials` and `watchSVIDRotation` (T-0040) |
| `tower/src/server.ts` | layout | calls the watch after `listen()` and gains its stop on shutdown (T-0040) |
| `tower/spec/behavior/spiffe-svid-rotation.spec.ts` | layout | new rotation spec beside `spiffe-mtls.spec.ts` (T-0041) |
| `tower/spec/lib/spiffe-test-certs.ts` | layout | cert helper gains a validity window for an expired SVID (T-0041) |
| `tower/TESTING.md` | co-change | 38% co-change with the two source files; its `spiffe-mtls.ts` entry is stale (T-0042) |
| `design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md` | design | the issue the second criterion closes (T-0043) |
| `design/issues/summary.md` | design | `flai issue close` rewrites it (T-0043) |

`flai touches suggest` also listed `tower/src/lib/build-app.ts` (38%) and provisioning files (25%). I left them out: the rotation runs on `app.server`, and `buildApp`'s `tls` option stays as it is.

No `after`: the story reads no other story's output. S-0015 (I-0001, `NODE_TLS_REJECT_UNAUTHORIZED=0`) is about the same mTLS link, from the client side. A trial merge judges any overlap.

Forecast: `flai forecast` gave 1h, `planning.default_duration`, since only one done story has usage. I raised it to 2h. The story has four tasks in three layers, and T-0041 needs real TLS handshakes with generated certificates, which `tower/TESTING.md` bug #8 shows has gotchas. Delivery is flai's date for 9th in the pull order, plus that extra hour.

Cost of delay: not set yet. S-0016 has no inputs and no epic, so `flai cod S-0016` refuses. The inputs are asked for on TH-0015.

Assumption: no test tier in `system-flow.yaml` runs tower's tests, as TH-0009 and TH-0012 found for keep, web, and chronicle. The tasks name `npm run test:behavior` in `tower/`. The story's agent follows the operator's answer on those threads.
