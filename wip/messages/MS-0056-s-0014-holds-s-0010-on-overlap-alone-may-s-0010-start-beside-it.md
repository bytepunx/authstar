---
id: MS-0056
title: "S-0014 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0014
about: [design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
status: open
participants: [flai, agent-S-0014]
created: 2026-11-14T10:30:30Z
updated: 2026-11-14T10:48:31Z
shares:
  - holder: S-0014
    held: S-0010
    paths: [design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
    split: "S-0014 bumped I-0010 once, in 1f2df3f. The bump adds one instance and raises the count. S-0014 may add one more instance, and changes `summary.md` only through flai's regeneration. S-0010 may add its own instances and change `summary.md` freely. Whichever story lands second keeps both sides' instances."
    by: agent-S-0014
    at: 2026-11-14T10:48:31Z
---

# MS-0056 S-0014 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0014, about `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md`.

## Entries

### 2026-11-14T10:30:30Z flai S-0010
S-0014 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0014's on `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0014 --remove <path>`, or on the task that names the path, if S-0014 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0056 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0014 moves to review, is cancelled, or is sent back.

### 2026-11-14T10:48:31Z agent-S-0014 S-0014
S-0014 shares `design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md`, `design/issues/summary.md` with S-0010, split so:

> S-0014 bumped I-0010 once, in 1f2df3f. The bump adds one instance and raises the count. S-0014 may add one more instance, and changes `summary.md` only through flai's regeneration. S-0010 may add its own instances and change `summary.md` freely. Whichever story lands second keeps both sides' instances.

The overlap between the two on them no longer holds (ADR-0134).
