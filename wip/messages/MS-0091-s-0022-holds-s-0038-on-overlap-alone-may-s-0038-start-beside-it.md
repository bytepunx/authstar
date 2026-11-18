---
id: MS-0091
title: "S-0022 holds S-0038 on overlap alone: may S-0038 start beside it?"
from: S-0038
to: S-0022
about: [design/issues/summary.md]
status: open
participants: [flai, agent-S-0022]
created: 2026-11-18T07:39:57Z
updated: 2026-11-18T07:44:16Z
---

# MS-0091 S-0022 holds S-0038 on overlap alone: may S-0038 start beside it?

Between S-0038 and S-0022, about `design/issues/summary.md`.

## Entries

### 2026-11-18T07:39:57Z flai S-0038
S-0022 holds S-0038 on overlap alone: may S-0038 start beside it?

S-0038, "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window", is ready, and its claim overlaps S-0022's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> This story remediates [I-0029](../../../design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md), "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window". The issue recommends no solution yet: propose one from its instances before building it.
>
> I-0029 is main's record of the defect S-0014 recorded as I-0031, "Tower stays down for about 27 seconds after taking its signet restart lock: app.close() does not finish, so the process waits for Kubernetes' SIGTERM". I-0031 is not on main: read it on `story/S-0014`, in `.flai-cache/worktrees/S-0014/design/issues/`, with `git show story/S-0014:design/issues/I-0031-tower-stays-down-for-about-27-seconds-after-taking-its-signet-restart-lock-app.md`.
>
> The two issues name different causes for the same hang in the restart-lock branch of `tower/src/server.ts`, so find which one holds before fixing it:
>
> - I-0029: a SIGTERM alone shuts tower down in about 1s, so the hang is after `app.close()`, most likely in `await lock.release()` from `@bytepunx/signet-client`.
> - I-0031: Fastify's `app.close()` waits for keep-alive connections, such as portcullis's client pool, to go idle; `forceCloseConnections`, or closing idle connections on the restart path, would end it.
>
> I-0029 shows herald hanging the same way, and its title says services, so cover every service that takes the restart lock, not tower alone. The failed runs are on TH-0061, TH-0063, TH-0064, and TH-0065, and in D-0052 and D-0056.
>
> S-0039 makes the golden path wait for these restarts (I-0035, and I-0030 on `story/S-0014`). This story shortens the window itself, so neither waits for the other.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0022 --remove <path>`, or on the task that names the path, if S-0022 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0091 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0038 can start.
3. Reply with `message_reply` saying why the hold stands: S-0038 waits until S-0022 moves to review, is cancelled, or is sent back.

### 2026-11-18T07:44:16Z agent-S-0022 S-0022 (settled)
S-0038 has started, so no hold is left. For the record: S-0022 changes `design/issues/summary.md` only through flai's regeneration when it closes or records issues, and makes no other change to it. S-0038 may change it freely; whichever story lands second keeps both sides.
