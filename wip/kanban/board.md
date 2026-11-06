---
title: Board
updated: 2026-11-06
status: active
wip_limits:
  ready: 5
  in-progress: 2
  review: 3
order:
  - S-0011
  - S-0007
  - S-0005
  - S-0010
  - S-0013
  - S-0012
placed:
  S-0005:
    by: claude
    at: 2026-10-21T05:13:56Z
  S-0007:
    by: claude
    at: 2026-10-21T05:29:49Z
  S-0010:
    by: claude
    at: 2026-10-21T05:13:56Z
  S-0011:
    by: claude
    at: 2026-10-21T05:13:56Z
  S-0012:
    by: claude
    at: 2026-10-21T05:13:56Z
  S-0013:
    by: claude
    at: 2026-10-21T05:13:56Z
---

# Board

Columns: backlog, ready, in-progress, review, done. Limits apply to stories. `order` is the pull order: ready stories first, then backlog stories in refinement order. Change it with `flai order <story> --before|--after <other>`, `--top`, or `--bottom`, or by dragging a card within its column on the dashboard's board; stories it does not name come last, by ID.

Auto-accept: stories tagged `auto-accept` may be moved from review to done by an agent.
