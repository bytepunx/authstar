---
id: MS-0069
title: "S-0023 holds S-0008 on overlap alone: may S-0008 start beside it?"
from: S-0008
to: S-0023
about: [design/issues/summary.md]
status: closed
participants: [flai, agent-S-0023, bytepunx]
created: 2026-11-14T17:29:44Z
updated: 2026-11-15T07:27:56Z
shares:
  - holder: S-0023
    held: S-0008
    paths: [design/issues/summary.md]
    split: "S-0023 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0018, and makes no other change to it. flai regenerates the file at every rebase, so S-0008 may change it freely; whichever story lands second keeps both sides."
    by: agent-S-0023
    at: 2026-11-14T17:29:57Z
  - holder: S-0023
    held: S-0008
    paths: [keep/TESTING.md]
    split: "S-0023's only change to `keep/TESTING.md` is one new section, \"The spec clock is kept monotonic (I-0018)\", placed between \"Six real gotchas this pilot found\" and \"A related, non-bug design quirk worth knowing\" (committed in 313c3d5). S-0023 makes no other change to the file. S-0008 adds its own entries anywhere else, and whichever story lands second keeps both sides."
    by: agent-S-0023
    at: 2026-11-14T17:49:44Z
---

# MS-0069 S-0023 holds S-0008 on overlap alone: may S-0008 start beside it?

Between S-0008 and S-0023, about `design/issues/summary.md`.

## Entries

### 2026-11-14T17:29:44Z flai S-0008
S-0023 holds S-0008 on overlap alone: may S-0008 start beside it?

S-0008, "Plan-mapping editor picks from the tenant's live Stripe prices", is ready, and its claim overlaps S-0023's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Creating a plan mapping in web lists the tenant's active Stripe prices and products instead of asking for a pasted price ID, as ADR-0046 requires.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0023 --remove <path>`, or on the task that names the path, if S-0023 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0069 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0008 can start.
3. Reply with `message_reply` saying why the hold stands: S-0008 waits until S-0023 moves to review, is cancelled, or is sent back.

### 2026-11-14T17:29:57Z agent-S-0023 S-0023
S-0023 shares `design/issues/summary.md` with S-0008, split so:

> S-0023 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0018, and makes no other change to it. flai regenerates the file at every rebase, so S-0008 may change it freely; whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-14T17:49:44Z agent-S-0023 S-0023
S-0023 shares `keep/TESTING.md` with S-0008, split so:

> S-0023's only change to `keep/TESTING.md` is one new section, "The spec clock is kept monotonic (I-0018)", placed between "Six real gotchas this pilot found" and "A related, non-bug design quirk worth knowing" (committed in 313c3d5). S-0023 makes no other change to the file. S-0008 adds its own entries anywhere else, and whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-15T07:27:56Z bytepunx
Closed: S-0023 was accepted
