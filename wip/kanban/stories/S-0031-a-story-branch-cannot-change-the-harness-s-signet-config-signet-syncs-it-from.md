---
id: S-0031
type: story
nature: remediation
title: "A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo"
status: backlog
owner: bytepunx
created: 2026-11-14T09:55:08Z
updated: 2026-11-14T09:55:08Z
transitions: []
tags: []
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
draft: true
cost_of_delay:
  inputs:
    time_lost_per_cycle: 1h16m
    by: flai
    at: 2026-11-14T09:55:08Z
---
# S-0031 A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo

## Goal

This story remediates [I-0014](../../../design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md), "A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0014 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0014 is closed with `flai issue close I-0014 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0014. time_lost_per_cycle 1h16m: 38m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-09T07:16:18Z, 5.1 days before this story; under one cycle counts as one).
