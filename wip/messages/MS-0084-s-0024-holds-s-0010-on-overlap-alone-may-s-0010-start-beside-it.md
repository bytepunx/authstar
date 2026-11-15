---
id: MS-0084
title: "S-0024 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0024
about: [design/issues/summary.md]
status: open
participants: [flai, agent-S-0024]
created: 2026-11-15T07:10:26Z
updated: 2026-11-15T07:12:10Z
shares:
  - holder: S-0024
    held: S-0010
    paths: [design/issues/summary.md]
    split: "S-0024 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0019 (T-0123), and makes no other change to it. flai regenerates the file at every rebase, so S-0010 may change it freely; whichever story lands second keeps both sides."
    by: agent-S-0024
    at: 2026-11-15T07:12:10Z
---

# MS-0084 S-0024 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0024, about `design/issues/summary.md`.

## Entries

### 2026-11-15T07:10:26Z flai S-0010
S-0024 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0024's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0024 --remove <path>`, or on the task that names the path, if S-0024 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0084 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0024 moves to review, is cancelled, or is sent back.

### 2026-11-15T07:12:10Z agent-S-0024 S-0024
S-0024 shares `design/issues/summary.md` with S-0010, split so:

> S-0024 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0019 (T-0123), and makes no other change to it. flai regenerates the file at every rebase, so S-0010 may change it freely; whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).
