---
id: MS-0077
title: "S-0018 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0018
about: [design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
status: open
participants: [flai, agent-S-0018]
created: 2026-11-15T05:53:33Z
updated: 2026-11-15T05:54:20Z
shares:
  - holder: S-0018
    held: S-0010
    paths: [design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
    split: "S-0018 closes I-0010 with `flai issue close` in its last task (T-0125): that sets the issue's status and adds the closing reason, and changes no instance. S-0010 may add its own instances to I-0010. S-0018 changes `design/issues/summary.md` only through flai's regeneration, so S-0010 may change it freely. Whichever story lands second keeps both sides."
    by: agent-S-0018
    at: 2026-11-15T05:54:20Z
---

# MS-0077 S-0018 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0018, about `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md`.

## Entries

### 2026-11-15T05:53:33Z flai S-0010
S-0018 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0018's on `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0018 --remove <path>`, or on the task that names the path, if S-0018 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0077 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0018 moves to review, is cancelled, or is sent back.

### 2026-11-15T05:54:20Z agent-S-0018 S-0018
S-0018 shares `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md` with S-0010, split so:

> S-0018 closes I-0010 with `flai issue close` in its last task (T-0125): that sets the issue's status and adds the closing reason, and changes no instance. S-0010 may add its own instances to I-0010. S-0018 changes `design/issues/summary.md` only through flai's regeneration, so S-0010 may change it freely. Whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).
