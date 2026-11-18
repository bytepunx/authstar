---
id: T-0179
type: task
nature: remediation
title: Chronicle releases its restart lock and exits within seconds, through the restart module tower's fix uses
status: cancelled
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:47Z
updated: 2026-11-18T07:45:09Z
transitions:
  - to: cancelled
    at: 2026-11-18T07:45:09Z
    by: agent-S-0038
stream: S-0038
tags: [chronicle]
touches: [chronicle/src/lib/restart-on-bundle-change.ts, chronicle/src/server.ts, chronicle/spec/behavior/restart-on-bundle-change.spec.ts, chronicle/TESTING.md]
after: [T-0175]
---
# T-0179 Chronicle releases its restart lock and exits within seconds, through the restart module tower's fix uses

## Work

This task waits for T-0175, because it copies the restart module and spec T-0175 writes for tower. Each Node service keeps its own copy, as each keeps its own `tower-tls.ts` (ADR-0113).

Chronicle's restart path in `chronicle/src/server.ts` differs from the others. Its `shutdown()` calls `process.exit(0)` itself, so `lock.release()` after it never runs, and the lock stays held until its TTL. Its `app.close()` can hang as tower's does. Its `waitForRestart` gets no abort signal, so a SIGTERM leaves the wait open until the exit.

Copy `tower/src/lib/restart-on-bundle-change.ts` to `chronicle/src/lib/restart-on-bundle-change.ts`. Call it from the restart branch, with the consumer, ClickHouse, and signet connection as its cleanup steps, so that the lock is released before the exit. Keep the SIGTERM and SIGINT handlers closing the app once.

Copy the spec to `chronicle/spec/behavior/restart-on-bundle-change.spec.ts`, against chronicle's own app, with a case showing that the lock is released before the exit. Note the restart path in `chronicle/TESTING.md`.

## Done when

- `chronicle/src/server.ts` restarts through `chronicle/src/lib/restart-on-bundle-change.ts`, and releases the lock before it exits.
- The behavior spec reproduces T-0174's hang and the release before the exit, and passes, under `flai test` on the changed paths.
- `chronicle/TESTING.md` says how the restart path is bounded and tested.

## Notes
- 2026-11-18T07:45:09Z: moved to cancelled: Chronicle does not hang: its shutdown calls process.exit(0) before lock.release(), and the exit closes its signet connection, which frees the lock at once (I-0039). No change needed.
