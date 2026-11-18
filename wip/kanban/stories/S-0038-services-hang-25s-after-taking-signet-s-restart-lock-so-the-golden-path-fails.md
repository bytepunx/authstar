---
id: S-0038
type: story
nature: remediation
title: "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window"
status: backlog
owner: bytepunx
created: 2026-11-15T07:27:58Z
updated: 2026-11-18T07:34:30Z
transitions: []
tags: []
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
draft: true
cost_of_delay:
  inputs:
    time_lost_per_cycle: 30m
    by: flai
    at: 2026-11-15T07:27:58Z
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
- [ ] The cause I-0029 describes no longer occurs, with a test that reproduces it where one fits
- [ ] A service that takes signet's restart lock exits within seconds of closing, without waiting for Kubernetes' SIGTERM or its liveness probe; this holds for tower and herald, and for each other service with the same restart path
- [ ] I-0029 is closed with `flai issue close I-0029 --reason` saying what fixed it, and the reason names I-0031 as the same defect

## Tasks

## Notes

Cost of delay inputs set by flai from I-0029. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-14T10:51:50Z, 0.9 days before this story; under one cycle counts as one).

I-0031 on `story/S-0014` adds one occurrence at 15m that I-0029's count does not carry. When S-0014 is accepted, I-0031 reaches main: close it as a duplicate of I-0029, or with the same reason if this story is done by then.

S-0014 is in progress and touches `tower/src/server.ts`, as this story will.
