---
id: T-0175
type: task
nature: remediation
title: Tower's restart on a bundle change exits within seconds, through a restart module with a test that reproduces the hang
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:28Z
updated: 2026-11-18T07:48:45Z
transitions:
  - to: ready
    at: 2026-11-18T07:45:09Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T07:45:09Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T07:48:45Z
    by: agent-S-0038
stream: S-0038
tags: [tower]
touches: [tower/src/lib/restart-on-bundle-change.ts, tower/src/server.ts, tower/spec/behavior/restart-on-bundle-change.spec.ts, tower/TESTING.md]
usage:
  source: log
  seconds: 216
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 39
      output: 7603
      cache_read: 3836759
      cache_write: 47267
      cost: 1.2818
---
# T-0175 Tower's restart on a bundle change exits within seconds, through a restart module with a test that reproduces the hang

## Work

T-0174 found the hang in `await lock.release()`: signet's `holdLock` never ends a stream the client half-closes, so `@bytepunx/signet-client`'s `Lock.release()` never resolves (I-0039). `app.close()` finishes: a SIGTERM in the window exits in about 1s because the SIGTERM branch reuses the settled `closeOnce()`.

Add `tower/src/lib/restart-on-bundle-change.ts`, exporting `shutDownForRestart`: it awaits the app's close, then races `lock.release()` against a timeout of 2 seconds, and logs which ended it with the elapsed time in fields. When the timeout wins it logs at `warn` and returns: the process then exits, its connection to signet closes, and signet frees the lock at once. Inject the timeout and the logger, so the spec runs in well under a second.

`tower/src/server.ts`'s restart branch calls it in place of `await closeOnce(); await lock.release()`, keeping `closeOnce` so a SIGTERM racing the restart still closes the app once.

In `tower/spec/behavior/restart-on-bundle-change.spec.ts`, reproduce the hang with signet-client's own `acquireLockWithStream` and a fake `LockStream` that, like signet's server, sends `ACQUIRED` and never ends after `closeSend()`: show that `lock.release()` alone does not settle, and that `shutDownForRestart` returns within its bound and logs the timeout. Add cases for a release that ends at once, and for close running before release.

Update the restart paragraph in `tower/TESTING.md`.

This task waits for no other: T-0174 is done.

## Done when

- `tower/src/lib/restart-on-bundle-change.ts` bounds the release, and `tower/src/server.ts` calls it.
- The behavior spec reproduces the hang, and passes with the module, under `flai test` on the changed paths.
- `tower/TESTING.md` says how the restart path is bounded and tested.

## Notes
