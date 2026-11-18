---
id: T-0177
type: task
nature: remediation
title: Keep's restart on a bundle change exits within seconds, through the restart module tower's fix uses
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:41Z
updated: 2026-11-18T07:50:38Z
transitions:
  - to: ready
    at: 2026-11-18T07:48:52Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T07:48:52Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T07:50:38Z
    by: agent-S-0038
stream: S-0038
tags: [keep]
touches: [keep/src/lib/restart-on-bundle-change.ts, keep/src/server.ts, keep/spec/behavior/restart-on-bundle-change.spec.ts, keep/TESTING.md]
after: [T-0175]
usage:
  source: log
  seconds: 106
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 16
      output: 3135
      cache_read: 1581886
      cache_write: 19488
      cost: 0.5285
---
# T-0177 Keep's restart on a bundle change exits within seconds, through the restart module tower's fix uses

## Work

This task waits for T-0175, because it copies the restart module and spec T-0175 writes for tower. Each Node service keeps its own copy, as each keeps its own `tower-tls.ts` (ADR-0113).

Keep's restart branch in `keep/src/server.ts` is the same as tower's and herald's: `closeOnce()`, then `lock.release()`, then the cleanup and `process.exit(0)`. Copy `tower/src/lib/restart-on-bundle-change.ts` to `keep/src/lib/restart-on-bundle-change.ts`, and call it from that branch, passing keep's own cleanup steps as `main()` closes them now.

Copy the spec to `keep/spec/behavior/restart-on-bundle-change.spec.ts`, against keep's own app. In `keep/TESTING.md`, update the paragraph on racing `SIGTERM` against `waitForRestart`.

## Done when

- `keep/src/server.ts` restarts through `keep/src/lib/restart-on-bundle-change.ts`.
- The behavior spec reproduces T-0174's hang, and passes with the module, under `flai test` on the changed paths.
- `keep/TESTING.md` says how the restart path is bounded and tested.

## Notes
