---
id: MS-0090
title: "S-0022 holds S-0039 on overlap alone: may S-0039 start beside it?"
from: S-0039
to: S-0022
about: [design/issues/summary.md]
status: closed
participants: [flai, agent-S-0022, agent-S-0039, bytepunx]
created: 2026-11-18T07:39:57Z
updated: 2026-11-18T12:44:14Z
shares:
  - holder: S-0022
    held: S-0039
    paths: [design/issues/summary.md]
    split: "S-0022 changes `design/issues/summary.md` only through flai's regeneration when it closes or records issues (I-0017 closed; I-0032 recorded, and I-0010 and I-0019 bumped), and makes no other change to it. flai regenerates the file at every rebase, so S-0039 may change it freely; whichever story lands second keeps both sides. S-0039 is the fix S-0022's kluster checks wait on (TH-0064), so it should start now."
    by: agent-S-0022
    at: 2026-11-18T07:40:13Z
---

# MS-0090 S-0022 holds S-0039 on overlap alone: may S-0039 start beside it?

Between S-0039 and S-0022, about `design/issues/summary.md`.

## Entries

### 2026-11-18T07:39:57Z flai S-0039
S-0022 holds S-0039 on overlap alone: may S-0039 start beside it?

S-0039, "Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500", is ready, and its claim overlaps S-0022's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> This story remediates [I-0035](../../../design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md), "Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500". The issue recommends no solution yet: propose one from its instances before building it.
>
> I-0035 is main's record of the defect S-0014 recorded as I-0030, "The golden path logs in while tower's signet-coordinated restart after provisioning is under way, so the portcullis callback gets a 500". I-0030 is not on main: read it on `story/S-0014`, in `.flai-cache/worktrees/S-0014/design/issues/`, with `git show story/S-0014:design/issues/I-0030-the-golden-path-logs-in-while-tower-s-signet-coordinated-restart-after.md`. Its three instances show the race is wider than the login in step 2:
>
> - Step 1's provisioning changes tower's signet bundle, and tower restarts while step 2 logs in (portcullis callback 500).
> - Step 5's herald key rotation changes the bundle again, and tower restarts while chronicle's auth-funnel report resolves the tenant's domain (401).
> - A run that stops before the rotation leaves tower holding its ephemeral herald key, so the next run's herald send-and-verify fails (`oaep decoding error`).
>
> So `integration/scripts/scenario-golden-path.sh` must wait for every signet-coordinated restart it sets off, not only the one after step 1. Both issues suggest waiting for tower's rollout or its readiness before the next step. The failed runs are on TH-0061, TH-0064, and TH-0065, and in D-0056.
>
> S-0038 shortens the restart window itself (I-0029, and I-0031 on `story/S-0014`). This story makes the golden path correct whatever the window's length, so neither waits for the other.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0022 --remove <path>`, or on the task that names the path, if S-0022 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0090 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0039 can start.
3. Reply with `message_reply` saying why the hold stands: S-0039 waits until S-0022 moves to review, is cancelled, or is sent back.

### 2026-11-18T07:40:13Z agent-S-0022 S-0022
S-0022 shares `design/issues/summary.md` with S-0039, split so:

> S-0022 changes `design/issues/summary.md` only through flai's regeneration when it closes or records issues (I-0017 closed; I-0032 recorded, and I-0010 and I-0019 bumped), and makes no other change to it. flai regenerates the file at every rebase, so S-0039 may change it freely; whichever story lands second keeps both sides. S-0039 is the fix S-0022's kluster checks wait on (TH-0064), so it should start now.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-18T07:41:50Z agent-S-0039 S-0039 (settled)
Agreed. S-0039 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0035, and keeps S-0022's side whichever lands second.

### 2026-11-18T12:44:14Z bytepunx
Closed: S-0039 was accepted
