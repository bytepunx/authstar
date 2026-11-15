---
id: MS-0042
title: "S-0015 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0015
about: [design/issues/summary.md]
status: closed
participants: [flai, agent-S-0015, bytepunx]
created: 2026-11-14T10:07:30Z
updated: 2026-11-15T05:53:17Z
shares:
  - holder: S-0015
    held: S-0010
    paths: [design/issues/summary.md]
    split: "S-0015 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0001, and makes no other change to it. S-0010 may change it freely; whichever lands second keeps both sides."
    by: agent-S-0015
    at: 2026-11-14T10:08:14Z
  - holder: S-0015
    held: S-0010
    paths: [integration/README.md, design/system/overview.md]
    split: "- `design/system/overview.md`: S-0015's only change is the \"Service identity\" row of the Cross-cutting table (a sentence and an ADR-0113 link), committed in 722a716, plus the `updated` date. S-0010 edits portcullis's and lookout's rows, the State section, or anything else.\n- `integration/README.md`: S-0015 changes only the Trust row of \"The tenant's JWKS host in-cluster\" section, dropping its mention of `NODE_TLS_REJECT_UNAUTHORIZED=0` for tower (T-0172). S-0010 edits anything else.\nWhichever lands second keeps both sides."
    by: agent-S-0015
    at: 2026-11-14T10:14:10Z
  - holder: S-0015
    held: S-0010
    paths: [docs/operators/index.md]
    split: "S-0015's only change to `docs/operators/index.md` is chronicle's environment-variable row, dropping `NODE_TLS_REJECT_UNAUTHORIZED` from its list, plus the `updated` date (committed in d03e254). S-0010 edits portcullis's rows or anything else; whichever lands second keeps both sides."
    by: agent-S-0015
    at: 2026-11-14T10:40:44Z
---

# MS-0042 S-0015 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0015, about `design/issues/summary.md`.

## Entries

### 2026-11-14T10:07:30Z flai S-0010
S-0015 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0015's on `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0015 --remove <path>`, or on the task that names the path, if S-0015 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0042 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0015 moves to review, is cancelled, or is sent back.

### 2026-11-14T10:08:14Z agent-S-0015 S-0015
S-0015 shares `design/issues/summary.md` with S-0010, split so:

> S-0015 changes `design/issues/summary.md` only through flai's regeneration when it closes I-0001, and makes no other change to it. S-0010 may change it freely; whichever lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-14T10:14:10Z agent-S-0015 S-0015
S-0015 shares `integration/README.md`, `design/system/overview.md` with S-0010, split so:

> - `design/system/overview.md`: S-0015's only change is the "Service identity" row of the Cross-cutting table (a sentence and an ADR-0113 link), committed in 722a716, plus the `updated` date. S-0010 edits portcullis's and lookout's rows, the State section, or anything else.
> - `integration/README.md`: S-0015 changes only the Trust row of "The tenant's JWKS host in-cluster" section, dropping its mention of `NODE_TLS_REJECT_UNAUTHORIZED=0` for tower (T-0172). S-0010 edits anything else.
> Whichever lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-14T10:40:44Z agent-S-0015 S-0015
S-0015 shares `docs/operators/index.md` with S-0010, split so:

> S-0015's only change to `docs/operators/index.md` is chronicle's environment-variable row, dropping `NODE_TLS_REJECT_UNAUTHORIZED` from its list, plus the `updated` date (committed in d03e254). S-0010 edits portcullis's rows or anything else; whichever lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).

### 2026-11-15T05:53:17Z bytepunx
Closed: S-0015 was accepted
