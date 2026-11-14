---
id: E-0003
type: epic
nature: feature
title: Analytics pipeline carries real events
status: in-progress
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-11-06T18:29:54Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
  - to: in-progress
    at: 2026-11-06T17:53:46Z
    by: agent-S-0009
tags: []
usage:
  source: sum
  seconds: 10194
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 4
      hand_edits: 5
      work: 94
    - day: 2026-11-10
      ceremony: 3
      hand_edits: 2
      work: 41
    - day: 2026-11-13
      ceremony: 4
      test_runs: 1
      work: 111
  models:
    - model: claude-opus-5-5
      input: 1042
      output: 340206
      cache_read: 114574925
      cache_write: 2755474
      cost: 46.3422
  strategic:
    - kind: planner
      seconds: 450
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 44
          output: 21289
          cache_read: 1661504
          cache_write: 115928
          cost: 0.1039
        - model: claude-opus-5-5
          input: 58
          output: 26329
          cache_read: 2902938
          cache_write: 143434
          cost: 2.2549
    - kind: orchestrator
      seconds: 221
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 148
          output: 1081
          cache_read: 4314269
          cache_write: 673509
          cost: 5.7738
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    time_lost_per_cycle: 30m
    by: alex
    at: 2026-11-06T18:00:32Z
---
# E-0003 Analytics pipeline carries real events

## Outcome

An authentication event at portcullis reaches ClickHouse through lookout and RabbitMQ, and chronicle's reports answer a request authenticated with the ES256 internal JWT portcullis mints, so a dashboard built on chronicle can show a real number.

## Stories
- S-0009 Chronicle verifies the ES256 internal JWT portcullis mints
- S-0010 Portcullis emits authentication events to lookout
- S-0017 Golden path reads chronicle's report with a portcullis-forwarded ES256 token

## Notes

From the 2026-10-20 audit: lookout to RabbitMQ to chronicle is wired and tested, and chronicle's auth-funnel, active-users, query, and export routes exist. Nothing feeds lookout (portcullis has no emitter; lookout accepts only `client.*` event types) and nothing can read chronicle (it verifies an HS256 shared secret while portcullis signs ES256; the integration harness flagged this as known and unaddressed).
- 2026-10-21T05:13:56Z: moved to ready: follows S-0009, which moved to ready
- 2026-11-06T17:53:46Z: moved to in-progress: follows S-0009, which moved to in-progress
