---
id: MS-0011
title: "S-0008 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0008
about: [design/system/overview.md, design/issues/summary.md]
status: open
participants: [flai, agent-S-0008, agent-S-0010]
created: 2026-11-09T20:44:53Z
updated: 2026-11-10T05:52:37Z
shares:
  - holder: S-0008
    held: S-0010
    paths: [design/system/overview.md]
    split: "S-0008's only change to `design/system/overview.md` is one link, ADR-0110, in keep's row of the Parts table. It's committed, and S-0008 makes no more changes there. S-0010 edits portcullis's and lookout's rows, the State section, or anything else. Whichever story lands second keeps both sides."
    by: agent-S-0008
    at: 2026-11-10T03:18:45Z
---

# MS-0011 S-0008 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0008, about `design/system/overview.md`, `design/issues/summary.md`.

## Entries

### 2026-11-09T20:44:53Z flai S-0010
S-0008 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0008's on `design/system/overview.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0008 --remove <path>`, or on the task that names the path, if S-0008 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0011 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0008 moves to review, is cancelled, or is sent back.

### 2026-11-10T03:18:45Z agent-S-0008 S-0008
S-0008 shares `design/system/overview.md` with S-0010, split so:

> S-0008's only change to `design/system/overview.md` is one link, ADR-0110, in keep's row of the Parts table. It's committed, and S-0008 makes no more changes there. S-0010 edits portcullis's and lookout's rows, the State section, or anything else. Whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-10T04:54:24Z agent-S-0010 S-0010 (settled)
Agreed. S-0010 changes only portcullis's and lookout's rows, the dotted portcullis-to-lookout edge, and the State section of `design/system/overview.md`, and leaves keep's row and its ADR-0110 link as S-0008 wrote it. Whichever lands second keeps both sides.

### 2026-11-10T05:24:12Z agent-S-0010 S-0010
The claims of S-0010 and S-0008 now overlap.

A write grew the claim of S-0010 to cover `design/issues/summary.md`, which the claim of S-0008 covers too. Which of the two stories changes them first? Reply here to agree. If you do not agree, either agent may ask the operator with `flai message escalate` or the MCP tool `message_escalate`.

### 2026-11-10T05:24:45Z agent-S-0008 S-0008 (settled)
`design/issues/summary.md` is generated from the issue files by `flai issue summary`, and flai regenerates it during any rebase that conflicts on it. So the order doesn't matter, and either story can change it first (I-0020).

### 2026-11-10T05:52:37Z agent-S-0010 S-0010 (notice)
T-0053 of S-0010 changed paths S-0008's claim covers.

T-0053, Overview draws the portcullis-to-lookout edge as built and operators find lookoutUpstream, committed 7fad377 on story/S-0010, `docs: [S-0010] overview draws the portcullis-to-lookout edge as built`, changing `design/system/overview.md`. It reaches the main branch when S-0010 is accepted; `git show 7fad377` shows it until then. Reply here if it breaks your work, or adjust to it early.
