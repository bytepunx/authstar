---
id: T-0176
type: task
nature: remediation
title: Herald's restart on a bundle change exits within seconds, through the restart module tower's fix uses
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:36Z
updated: 2026-11-18T07:50:36Z
transitions:
  - to: ready
    at: 2026-11-18T07:48:51Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T07:48:51Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T07:50:36Z
    by: agent-S-0038
stream: S-0038
tags: [herald]
touches: [herald/src/lib/restart-on-bundle-change.ts, herald/src/server.ts, herald/spec/behavior/restart-on-bundle-change.spec.ts, herald/TESTING.md]
after: [T-0175]
usage:
  source: log
  seconds: 105
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 14
      output: 2716
      cache_read: 1370789
      cache_write: 16887
      cost: 0.458
---
# T-0176 Herald's restart on a bundle change exits within seconds, through the restart module tower's fix uses

## Work

This task waits for T-0175, because it copies the restart module and spec T-0175 writes for tower. Each Node service keeps its own copy, as each keeps its own `tower-tls.ts` (ADR-0113).

Copy `tower/src/lib/restart-on-bundle-change.ts` to `herald/src/lib/restart-on-bundle-change.ts`, and call it from the restart branch of `herald/src/server.ts`, in place of the inline sequence and T-0174's step logs. Herald's `closeOnce` is `app.close()` alone, with no SVID watch to stop. Pass its own cleanup steps, such as the send worker and the AMQP connection, as `main()` closes them now.

Copy the spec to `herald/spec/behavior/restart-on-bundle-change.spec.ts`, against herald's own app where tower's spec builds tower's. Update the shutdown paragraph in `herald/TESTING.md`.

## Done when

- `herald/src/server.ts` restarts through `herald/src/lib/restart-on-bundle-change.ts`.
- The behavior spec reproduces T-0174's hang, and passes with the module, under `flai test` on the changed paths.
- `herald/TESTING.md` says how the restart path is bounded and tested.

## Notes
