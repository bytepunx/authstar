---
id: T-0174
type: task
nature: research
title: Find which step of the restart-lock branch hangs, app.close() or lock.release(), on a live namespace
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:17Z
updated: 2026-11-18T07:45:13Z
transitions:
  - to: ready
    at: 2026-11-18T07:45:08Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T07:45:09Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T07:45:13Z
    by: agent-S-0038
stream: S-0038
tags: [tower, herald]
usage:
  source: log
  seconds: 4
  estimated: true
  priced_by: harness
  models: []
---
# T-0174 Find which step of the restart-lock branch hangs, app.close() or lock.release(), on a live namespace

## Work

This task waits for no other: it decides the fix the later tasks build.

I-0029 puts the hang in `await lock.release()` from `@bytepunx/signet-client`. I-0031 puts it in Fastify's `app.close()`, waiting on keep-alive connections such as portcullis's client pool. Both fit the logs on main, because the restart branch logs nothing between "acquired restart lock" and the exit.

1. In the restart branch of `tower/src/server.ts` and `herald/src/server.ts`, log one line after each step with the milliseconds since the lock was taken: `closeOnce()` done, `lock.release()` done, the cleanup done. Before `app.close()`, also log how many connections the server holds, from `app.server.getConnections`.
2. Deploy the story's branch to `s-0038` with `flai kluster deploy S-0038 --job`, then run its checks with `flai checks run S-0038 --job`. The golden path's tenant provisioning and herald's key rotation change the two services' bundles.
3. Read tower's and herald's pod logs in the namespace, for example with `flai kluster exec S-0038 -- kubectl logs`. Find the step whose log line is missing, or comes 20 seconds or more after the one before.
4. Read `Lock.release()` in `tower/node_modules/@bytepunx/signet-client/dist/restart.js`. It waits for the server to end the stream after `closeSend()`. Say whether signet ends it at once or only at the lock's 30-second TTL.
5. In the same logs, check chronicle and portcullis. `chronicle/src/server.ts` calls `process.exit(0)` inside `shutdown()`, so `lock.release()` never runs there. Portcullis drops its server future and calls `lock.release()` alone, in `portcullis/crates/authstar-proxy/src/main.rs`. Say whether either one is down past a few seconds after it takes the lock.

Keep the step logs: the next tasks move them into each service's restart module.

## Done when

- The narrative's `## Decisions` names the step that hangs in tower and in herald, quoting the log lines and timestamps that show it.
- The same entry says whether chronicle's and portcullis's restarts hang, and whether signet's server ends a released lock's stream before the TTL.
- If portcullis hangs, a task to fix `portcullis/crates/authstar-proxy/src/main.rs` exists on S-0038.
- The step logs are committed in `tower/src/server.ts` and `herald/src/server.ts`.

## Notes
