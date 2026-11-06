---
id: E-0004
type: epic
nature: feature
title: Dashboards in web and steward show what the platform is doing
status: ready
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-11-06T18:00:17Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
usage:
  source: sum
  seconds: 0
  models: []
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
      seconds: 99
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 66
          output: 496
          cache_read: 1790979
          cache_write: 310662
          cost: 2.5496
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
