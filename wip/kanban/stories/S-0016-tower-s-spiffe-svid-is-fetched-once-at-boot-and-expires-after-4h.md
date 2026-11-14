---
id: S-0016
type: story
nature: remediation
title: Tower's SPIFFE SVID is fetched once at boot and expires after 4h
status: review
owner: bytepunx
created: 2026-11-06T17:38:17Z
updated: 2026-11-14T11:32:03Z
transitions:
  - to: ready
    at: 2026-11-14T10:07:04Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-14T10:07:39Z
    by: agent-S-0016
  - to: review
    at: 2026-11-14T10:45:06Z
    by: agent-S-0016
  - to: in-progress
    at: 2026-11-14T10:48:29Z
    by: flai
  - to: review
    at: 2026-11-14T11:32:03Z
    by: agent-S-0016
tags: [tower, spiffe, mtls]
touches: [tower/src/lib/spiffe-mtls.ts, tower/src/server.ts, tower/spec/behavior/spiffe-svid-rotation.spec.ts, tower/spec/lib/spiffe-test-certs.ts, tower/TESTING.md, design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md, design/issues/summary.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md]
usage:
  source: log
  seconds: 4888
  priced_by: harness
  turns:
    - day: 2026-11-14
      ceremony: 3
      hand_edits: 3
      work: 150
  models:
    - model: claude-opus-5-5
      input: 402
      output: 63859
      cache_read: 45527311
      cache_write: 843716
      cost: 15.5509
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
      seconds: 169
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 103
          output: 693
          cache_read: 3050812
          cache_write: 403003
          cost: 3.8945
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 25
    by: alex
    at: 2026-11-06T18:21:21Z
forecast:
  duration: 2h
  delivery: 2026-11-17T04:42:00Z
  basis: "Its own forecast of 2h; 7th in the pull order with an in-progress limit of 4, behind S-0013, S-0012, S-0007, S-0008, S-0010, S-0014 and S-0015."
  by: flai
  at: 2026-11-14T09:55:08Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:06:37Z
---
# S-0016 Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Goal

This story remediates [I-0002](../../../design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md), "Tower's SPIFFE SVID is fetched once at boot and expires after 4h". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [x] The cause I-0002 describes no longer occurs, with a test that reproduces it where one fits
- [x] I-0002 is closed with `flai issue close I-0002 --reason` saying what fixed it

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

### For the operator

- Please close bytepunx/authstar-tower#4, which I-0002's instance cites. S-0016 closed I-0002 in 6139a22: tower rotates its SVID in place, and `tower/spec/behavior/spiffe-svid-rotation.spec.ts` proves it.
- Tower's tests ran through `flai test` and the close-out, as D-0017 says, not through `npm` by hand. The tier runs every project's suite, and steward's e2e failed twice on ports another worktree held (I-0010, bumped in 7bd7687).
- The rotation is proven in the behavior tier with an injected SVID stream, not against a live SPIRE agent.
- The review deployed S-0016 to kluster at 51aaf50.
  - The first checks run failed golden-path step 4b (TH-0060). Provisioning made tower restart, and tower then hung about 25s after taking signet's restart lock. Herald did the same. The cause is outside the story, recorded as I-0029.
  - A SIGTERM shut tower down in about 1s through the new stop function.
  - The checks passed at the same commit (job `S-0016-checks-20261114T105053Z`), with tower serving mTLS to portcullis.
- 2026-11-14T10:48:29Z: moved to in-progress: flai serve's checks of S-0016 against its kluster namespace ended failed, at the check golden-path, at commit 51aaf5056c27
