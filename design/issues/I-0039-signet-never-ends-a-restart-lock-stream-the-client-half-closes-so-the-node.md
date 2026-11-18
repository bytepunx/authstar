---
id: I-0039
title: Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves
class: defect
status: open
count: 1
cost: 30m
first_reported: 2026-11-18T07:44:49Z
last_reported: 2026-11-18T07:44:49Z
updated: 2026-11-18T07:44:49Z
---

# I-0039 Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves

## Description
Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves

## Instances

### 2026-11-18T07:44:49Z
Story: S-0038.
Found by S-0038 reading the sources, as the cause of I-0029 (and I-0031 on `story/S-0014`). Both live outside this repository, in `bytepunx/signet`.

- `@bytepunx/signet-client` 0.9.0, `dist/restart.js`: `Lock.release()` stops the heartbeat, calls `closeSend()` (a gRPC half-close, `stream.end()`), then awaits `recvDone`. `recvDone` resolves only when the stream ends or errors.
- signet `server/internal/api/locks.go`, `holdLock`: the loop selects only on `ctx.Done()` and the heartbeat channel. The goroutine that reads the client's messages returns on `io.EOF`, but `holdLock` never learns of it. A half-close does not cancel the RPC's context, so the handler never returns and never ends the stream.
- So `await lock.release()` never resolves. tower, herald, and keep await it before `process.exit(0)`, and stay up with their port closed until Kubernetes' liveness probe sends SIGTERM, about 25s later. The SIGTERM branch then resolves the race at once, which is why a SIGTERM exits in about 1s.
- `client-go/restart.go`'s `Release()` waits on `recvDoneCh` in the same way. The Rust client, which portcullis uses, breaks its loop after `close_send()` and drops the stream, so it does not hang.
- The lock itself is not held for long: when the process exits, its connection closes, the RPC's context is cancelled, and `holdLock`'s deferred `Release` frees the lock.

Upstream fixes, for the signet repository: `holdLock` returns when the client's stream reaches EOF; the Node and Go clients cancel the call after `closeSend()`, or stop waiting on `recvDone`. S-0038 bounds the wait in each Node service instead.

## Remediation
