---
id: MS-0011
title: "S-0008 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0008
about: [design/system/overview.md]
status: open
participants: [flai]
created: 2026-11-09T20:44:53Z
updated: 2026-11-09T20:44:53Z
---

# MS-0011 S-0008 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0008, about `design/system/overview.md`.

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
