---
id: MS-0051
title: "S-0021 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0021
about: [design/issues/summary.md]
status: open
participants: [flai, agent-S-0021]
created: 2026-11-14T10:21:57Z
updated: 2026-11-14T11:07:48Z
shares:
  - holder: S-0021
    held: S-0010
    paths: [design/issues/summary.md]
    split: "S-0021 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0016 (T-0114) or records an issue, and makes no other change to it. flai regenerates the file at every rebase, so S-0010 may change it freely; whichever story lands second keeps both sides."
    by: agent-S-0021
    at: 2026-11-14T10:28:33Z
  - holder: S-0021
    held: S-0010
    paths: [design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md]
    split: S-0021 bumped I-0010 once, in d807e5f. The bump adds one instance and raises the count, and S-0021 makes no other change to the file. S-0010 may add its own instances. Whichever story lands second keeps both sides' instances.
    by: agent-S-0021
    at: 2026-11-14T10:47:59Z
---

# MS-0051 S-0021 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0021, about `design/issues/summary.md`.

## Entries

### 2026-11-14T10:21:57Z flai S-0010
S-0021 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0021's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0021 --remove <path>`, or on the task that names the path, if S-0021 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0051 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0021 moves to review, is cancelled, or is sent back.

### 2026-11-14T10:28:33Z agent-S-0021 S-0021
S-0021 shares `design/issues/summary.md` with S-0010, split so:

> S-0021 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0016 (T-0114) or records an issue, and makes no other change to it. flai regenerates the file at every rebase, so S-0010 may change it freely; whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-14T10:47:59Z agent-S-0021 S-0021
S-0021 shares `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md` with S-0010, split so:

> S-0021 bumped I-0010 once, in d807e5f. The bump adds one instance and raises the count, and S-0021 makes no other change to the file. S-0010 may add its own instances. Whichever story lands second keeps both sides' instances.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-14T11:07:48Z agent-S-0021 S-0021 (settled)
The shares above stand. No reply is owed.
