---
id: E-0004
type: epic
nature: feature
title: Dashboards in web and steward show what the platform is doing
status: in-progress
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-11-09T07:03:32Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
  - to: in-progress
    at: 2026-11-09T07:03:32Z
    by: agent-S-0011
tags: []
usage:
  source: sum
  seconds: 6130
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 4
      test_runs: 1
      hand_edits: 4
      work: 107
    - day: 2026-11-10
      work: 6
  models:
    - model: claude-opus-5-5
      input: 568
      output: 156316
      cache_read: 46941455
      cache_write: 1318254
      cost: 21.7442
  strategic:
    - kind: planner
      seconds: 940
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 945
          output: 61342
          cache_read: 59269593
          cache_write: 728897
          cost: 20.7006
    - kind: orchestrator
      seconds: 202
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 124
          output: 907
          cache_read: 3438288
          cache_write: 552145
          cost: 4.747
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 100
    by: alex
    at: 2026-11-06T18:00:17Z
---
# E-0004 Dashboards in web and steward show what the platform is doing

## Outcome

Web's navigation only names sections that exist, its Overview shows the tenant's live tiles (ADR-0061) from tower, keep, and chronicle, and the analytics section (ADR-0059) renders chronicle's auth funnel and active users; steward gains the activity and stuck-erasure screens its client already supports (story steward/004).

## Stories
- S-0011 Web's navigation names only the sections that exist and errors have a page
- S-0012 Web's Overview shows live tiles from tower, keep, and chronicle
- S-0013 Steward shows tenant activity and stuck erasure requests

## Notes

Depends on E-0003 for any real analytics number. From the 2026-10-20 audit: web's nav declares eight sections and two have routes, there is no error page, no pending state on any form, no chart library, and no call to chronicle in either app; steward has client methods for activity and stuck erasures with no screens.
- 2026-10-21T05:13:56Z: moved to ready: follows S-0011, which moved to ready
- 2026-11-09T07:03:32Z: moved to in-progress: follows S-0011, which moved to in-progress
