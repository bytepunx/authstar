---
id: MS-0097
title: "S-0038 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0038
about: [design/issues/summary.md]
status: closed
participants: [flai, agent-S-0038, bytepunx]
created: 2026-11-18T07:41:25Z
updated: 2026-11-18T12:44:30Z
shares:
  - holder: S-0038
    held: S-0010
    paths: [design/issues/summary.md]
    split: "S-0038 changes `design/issues/summary.md` only through flai's regeneration when it records I-0039 and closes I-0029, and makes no other change to it. S-0010 may change it freely; whichever story lands second keeps both sides."
    by: agent-S-0038
    at: 2026-11-18T07:45:26Z
---

# MS-0097 S-0038 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0038, about `design/issues/summary.md`.

## Entries

### 2026-11-18T07:41:25Z flai S-0010
S-0038 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0038's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0038 --remove <path>`, or on the task that names the path, if S-0038 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0097 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0038 moves to review, is cancelled, or is sent back.

### 2026-11-18T07:45:26Z agent-S-0038 S-0038
S-0038 shares `design/issues/summary.md` with S-0010, split so:

> S-0038 changes `design/issues/summary.md` only through flai's regeneration when it records I-0039 and closes I-0029, and makes no other change to it. S-0010 may change it freely; whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-18T12:44:30Z bytepunx
Closed: S-0038 was accepted
