---
id: S-0018
type: story
nature: improvement
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
status: backlog
owner: bytepunx
created: 2026-11-06T21:11:49Z
updated: 2026-11-06T21:11:49Z
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
    time_lost_per_cycle: 15m
    by: flai
    at: 2026-11-06T21:11:49Z
---
# S-0018 The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Goal

This story remediates [I-0010](../../../design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md), "The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0010 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0010 is closed with `flai issue close I-0010 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0010. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-06T18:29:23Z, 0.1 days before this story; under one cycle counts as one).
