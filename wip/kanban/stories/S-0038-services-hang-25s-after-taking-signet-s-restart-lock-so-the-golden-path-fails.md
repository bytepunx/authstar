---
id: S-0038
type: story
nature: remediation
title: "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window"
status: review
owner: bytepunx
created: 2026-11-15T07:27:58Z
updated: 2026-11-18T08:55:04Z
transitions:
  - to: ready
    at: 2026-11-18T07:39:49Z
    by: alex
  - to: in-progress
    at: 2026-11-18T07:41:24Z
    by: agent-S-0038
  - to: review
    at: 2026-11-18T08:55:04Z
    by: agent-S-0038
blocked:
  - from: 2026-11-18T07:54:30Z
    until: 2026-11-18T08:45:27Z
    reason: awaiting the operator on TH-0076
tags: [tower, herald, keep, chronicle]
topics: [signet, kluster, testing]
touches: [tower/src/server.ts, tower/src/lib/restart-on-bundle-change.ts, tower/spec/behavior/restart-on-bundle-change.spec.ts, tower/TESTING.md, herald/src/server.ts, herald/src/lib/restart-on-bundle-change.ts, herald/spec/behavior/restart-on-bundle-change.spec.ts, herald/TESTING.md, keep/src/server.ts, keep/src/lib/restart-on-bundle-change.ts, keep/spec/behavior/restart-on-bundle-change.spec.ts, keep/TESTING.md, chronicle/src/server.ts, chronicle/src/lib/restart-on-bundle-change.ts, chronicle/spec/behavior/restart-on-bundle-change.spec.ts, chronicle/TESTING.md, design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md, design/issues/summary.md, design/issues/I-0039-signet-never-ends-a-restart-lock-stream-the-client-half-closes-so-the-node.md, design/issues/I-0027-golden-path-step-5-herald-cannot-decrypt-its-own-invite-after-the-key-rotation.md, design/issues/I-0041-kubernetes-backs-off-a-second-clean-restart-lock-exit-within-minutes-so-tower.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 1341
  priced_by: harness
  turns:
    - day: 2026-11-18
      ceremony: 4
      hand_edits: 1
      work: 94
  models:
    - model: claude-opus-5-5
      input: 276
      output: 53606
      cache_read: 27053292
      cache_write: 333281
      cost: 9.038
  strategic:
    - kind: planner
      seconds: 261
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 125
          output: 45500
          cache_read: 5856030
          cache_write: 258344
          cost: 4.1485
    - kind: orchestrator
      seconds: 145
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 93
          output: 783
          cache_read: 2736455
          cache_write: 355912
          cost: 3.4094
cost_of_delay:
  inputs:
    time_lost_per_cycle: 30m
    by: flai
    at: 2026-11-15T07:27:58Z
  value: 75
  by: planner-S-0038
  at: 2026-11-18T07:38:36Z
forecast:
  duration: 2h30m
  delivery: 2026-12-04T17:43:00Z
  basis: "flai forecast's 1h39m (282 s per unit over 4 done remediation stories, size 21), raised by 51m for two kluster deploy-and-checks rounds (T-0174, T-0181) that size does not count, with delivery moved by the same 51m from flai's 2026-12-04T16:52:00Z at 17th in the pull order."
  by: planner-S-0038
  at: 2026-11-18T07:38:36Z
finalized:
  by: alex
  at: 2026-11-18T07:39:49Z
---
# S-0038 Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window

## Goal

This story remediates [I-0029](../../../design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md), "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window". The issue recommends no solution yet: propose one from its instances before building it.

I-0029 is main's record of the defect S-0014 recorded as I-0031, "Tower stays down for about 27 seconds after taking its signet restart lock: app.close() does not finish, so the process waits for Kubernetes' SIGTERM". I-0031 is not on main: read it on `story/S-0014`, in `.flai-cache/worktrees/S-0014/design/issues/`, with `git show story/S-0014:design/issues/I-0031-tower-stays-down-for-about-27-seconds-after-taking-its-signet-restart-lock-app.md`.

The two issues name different causes for the same hang in the restart-lock branch of `tower/src/server.ts`, so find which one holds before fixing it:

- I-0029: a SIGTERM alone shuts tower down in about 1s, so the hang is after `app.close()`, most likely in `await lock.release()` from `@bytepunx/signet-client`.
- I-0031: Fastify's `app.close()` waits for keep-alive connections, such as portcullis's client pool, to go idle; `forceCloseConnections`, or closing idle connections on the restart path, would end it.

I-0029 shows herald hanging the same way, and its title says services, so cover every service that takes the restart lock, not tower alone. The failed runs are on TH-0061, TH-0063, TH-0064, and TH-0065, and in D-0052 and D-0056.

S-0039 makes the golden path wait for these restarts (I-0035, and I-0030 on `story/S-0014`). This story shortens the window itself, so neither waits for the other.

## Acceptance criteria
- [x] The cause I-0029 describes no longer occurs, with a test that reproduces it where one fits
- [x] A service that takes signet's restart lock exits within seconds of closing, without waiting for Kubernetes' SIGTERM or its liveness probe; this holds for tower and herald, and for each other service with the same restart path
- [x] I-0029 is closed with `flai issue close I-0029 --reason` saying what fixed it, and the reason names I-0031 as the same defect

## Tasks
- T-0174 Find which step of the restart-lock branch hangs, app.close() or lock.release(), on a live namespace
- T-0175 Tower's restart on a bundle change exits within seconds, through a restart module with a test that reproduces the hang
- T-0176 Herald's restart on a bundle change exits within seconds, through the restart module tower's fix uses
- T-0177 Keep's restart on a bundle change exits within seconds, through the restart module tower's fix uses
- T-0179 Chronicle releases its restart lock and exits within seconds, through the restart module tower's fix uses
- T-0181 Show on s-0038 that tower, herald, keep, and chronicle exit within seconds of taking the restart lock
- T-0184 Close I-0029 with what fixed it, naming I-0031 as the same defect

## Notes

Cost of delay inputs set by flai from I-0029. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-14T10:51:50Z, 0.9 days before this story; under one cycle counts as one).

I-0031 on `story/S-0014` adds one occurrence at 15m that I-0029's count does not carry. When S-0014 is accepted, I-0031 reaches main: close it as a duplicate of I-0029, or with the same reason if this story is done by then.

S-0014 is in progress and touches `tower/src/server.ts`, as this story will.

### Live check on s-0038

The deploy at 56b429b (job S-0038-deploy-20261118T084815Z) showed criterion 2 for tower and herald:

| Service | Took the lock | Release timed out, exited 0 | Listening again |
|---------|---------------|-----------------------------|-----------------|
| tower | 08:50:40.087Z | 08:50:42.089Z (elapsed_ms 1999) | 08:50:52Z, after a kubelet back-off (I-0041) |
| herald | 08:50:40.113Z | 08:50:42.113Z (elapsed_ms 1998) | 08:50:44Z |

Both containers ended `Completed` with exit 0, and no liveness probe killed either one. Keep's bundle did not change in this run. Its restart branch runs the same module, and its behavior spec covers it.

The deploy's checks failed only at golden-path step 5, with herald's OAEP decoding error. That is I-0027's rotation race, bumped here. It is not this hang: step 5 ran before the restarts.

### Planning

Touches, and where each came from:

| Touches | Source |
|---------|--------|
| `tower/src/server.ts` | design: the goal names it |
| `herald/src/server.ts`, `keep/src/server.ts`, `chronicle/src/server.ts` | layout: each calls `waitForRestart` from `@bytepunx/signet-client` and runs the same restart branch; the goal asks for every service that takes the lock |
| `<service>/src/lib/restart-on-bundle-change.ts` and `<service>/spec/behavior/restart-on-bundle-change.spec.ts`, for tower, herald, keep, and chronicle | layout: `main()` is not testable as it stands, so each service gets a restart module and a behavior spec, one copy per service, as each keeps its own `tower-tls.ts` (ADR-0113) |
| `tower/TESTING.md`, `herald/TESTING.md`, `keep/TESTING.md`, `chronicle/TESTING.md` | layout: the first three describe the restart race today; chronicle's gains the same note |
| `design/issues/I-0029-…`, `design/issues/summary.md` | design: the third criterion closes I-0029, and flai rewrites the summary |

Left out:

- `tower/src/lib/build-app.ts` and `keep/src/lib/build-app.ts`, which co-change with the touches in 8% and 7% of commits. The fix closes connections on the restart path alone, so `buildApp`'s Fastify options stay as they are.
- `portcullis/crates/authstar-proxy/src/main.rs`. Portcullis takes the lock too, but no instance shows it hanging, and its restart drops the server future before `lock.release()`. T-0174 checks it, and adds a task if it hangs.
- lookout, web, and steward: they take no restart lock.

No folder touch, and no `after`: the fix reads nothing that another open story writes. S-0039 changes the golden path's waits, not the services.

Forecast: flai gave 1h39m (282 s per unit of size over 4 done remediation stories, size 21). I raised it to 2h30m, for two kluster deploy-and-checks rounds, in T-0174 and T-0181, that size does not count. Delivery moves by the same 51m, from flai's 2026-12-04T16:52:00Z at 17th in the pull order.

Cost of delay value: 75 USD a week, as flai cod works it out from the input `time_lost_per_cycle` 30m at 150 USD an hour, one cycle a week. It stands as the inputs give it. I-0029 now counts 2 instances, and I-0031 a third, so the input may understate the loss: the plan's thread asks about it.
