---
id: TH-0076
title: "Plan for S-0038: diagnose the restart-lock hang, bound it in tower, copy the fix to herald, keep, and chronicle, prove it live"
anchor:
  path: wip/kanban/stories/S-0038-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md
  item: S-0038
status: resolved
participants: [planner-S-0038, agent-S-0038, alex]
created: 2026-11-18T07:38:52Z
updated: 2026-11-18T08:45:27Z
---

# TH-0076 Plan for S-0038: diagnose the restart-lock hang, bound it in tower, copy the fix to herald, keep, and chronicle, prove it live

On wip/kanban/stories/S-0038-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md.

## Entries

### 2026-11-18T07:38:52Z planner-S-0038
S-0038 has seven tasks in five layers, with touches, a forecast of 2h30m, and a cost of delay value of 75 USD a week.

## Tasks and layers

| Layer | Task | What it does |
|-------|------|--------------|
| 1 | T-0174 (research) | Logs each restart step's elapsed time in tower and herald, deploys s-0038, and finds which step hangs: `app.close()` (I-0031) or `lock.release()` (I-0029). Also checks chronicle, portcullis, and whether signet ends a released lock's stream before its 30s TTL. |
| 2 | T-0175 | Tower: moves the restart sequence into `tower/src/lib/restart-on-bundle-change.ts`, bounds each step, and adds a final exit deadline. A behavior spec reproduces the hang T-0174 found. |
| 3 | T-0176, T-0177, T-0179 | Herald, keep, and chronicle copy T-0175's module and spec. They run together, since no two touch the same file. |
| 4 | T-0181 | Deploys s-0038 again and gives each service's lock-to-exit seconds from the logs, each under 10s, with no liveness kills. |
| 5 | T-0184 | Closes I-0029 naming I-0031, and closes I-0031 too if S-0014 has landed. |

Each `after` reads the earlier task's output. T-0175 builds on T-0174's finding. The layer-3 tasks copy T-0175's module. T-0181 checks all four fixes. T-0184's reason quotes T-0181's figures.

## Assumptions

- The fix bounds both candidate steps whichever one T-0174 finds, so it holds either way. On the restart path only, connections are closed after a short grace. `lock.release()` races a timeout of a few seconds, since the lock expires through its TTL anyway, as portcullis already allows. `buildApp`'s Fastify options stay as they are.
- Each Node service keeps its own copy of the restart module, as each keeps its own `tower-tls.ts` (ADR-0113). The module is not shared through `clients/typescript`, which would need a package release.
- Chronicle is in scope although no instance names it. Its `shutdown()` calls `process.exit(0)` before `lock.release()`, so it never releases the lock.
- Portcullis is checked in T-0174 but not planned for a fix, since nothing shows it hanging. If it hangs, T-0174 adds a task on `portcullis/crates/authstar-proxy/src/main.rs`.
- If signet's server only ends a released lock's stream at the TTL, the root cause is in signet or `@bytepunx/signet-client`, which are other repositories. This story bounds the wait locally. The agent should record the upstream defect as an issue rather than change those repositories.
- No ADR is planned: the bound is an implementation detail recorded in each service's TESTING.md. Say so if you want an ADR.

## Proposals

- The cost of delay input `time_lost_per_cycle` is 30m, from I-0029's first instance. I-0029 now counts 2 instances (23m), and I-0031 a third (15m). D-0056 also records three stories accepted past a failing golden path in this window. I kept the value at 75 USD a week as the input gives it. Raising the input is yours to decide: I would recommend 1h a cycle, which flai would work out to 150 USD a week.
- T-0181 touches no file: it only deploys and reads logs. I kept it apart from T-0184 because the live check can fail on its own.

### 2026-11-18T07:45:35Z agent-S-0038
Plan taken, with three changes, recorded in the narrative's Decisions.

- **T-0174 closed from the sources, with no deploy.** The hang is in `await lock.release()`. Signet's `holdLock` (`server/internal/api/locks.go`) returns only on `ctx.Done()` or a heartbeat error. A client half-close does not cancel the RPC's context, so the handler never ends the stream, and `@bytepunx/signet-client`'s `Lock.release()` waits on `recvDone` forever. `app.close()` finishes: a SIGTERM in the window exits in about 1s because the SIGTERM branch reuses the settled `closeOnce()`. Recorded upstream as I-0039. Portcullis's Rust client drops the stream after `close_send()`, so it does not hang.
- **T-0175 bounds only the release**, at 2 seconds, then the process exits. Its connection to signet closes and signet frees the lock at once. There is no grace on `app.close()` and no final deadline, since no evidence shows either step hanging.
- **T-0179 (chronicle) cancelled.** Chronicle calls `process.exit(0)` before `lock.release()`, so it never waits on the release, and the exit frees the lock.

The layers are now T-0175, then T-0176 and T-0177 together, then T-0181, then T-0184. The cost-of-delay input is yours: I have not changed it.

### 2026-11-18T08:45:27Z alex
Plan accepted as written. Keep time_lost_per_cycle at 30m and add no ADR. T-0174's finding (lock.release(), I-0039) stands; s-0014 is torn down (TH-0078), so deploy s-0038 for T-0181 now.

Resolved.
