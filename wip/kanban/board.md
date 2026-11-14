---
title: Board
updated: 2026-11-14
status: active
wip_limits:
  ready: 5
  in-progress: 4
  review: 3
order:
  - S-0012
  - S-0007
  - S-0008
  - S-0010
---

# Board

Columns: backlog, ready, in-progress, review, done. Limits apply to stories. `order` is the pull order: ready stories first, then backlog stories in refinement order. Change it with `flai order <story> --before|--after <other>`, `--top`, or `--bottom`, or by dragging a card within its column on the dashboard's board; stories it does not name come last, by ID.

Auto-accept: stories tagged `auto-accept` may be moved from review to done by an agent.
