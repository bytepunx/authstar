---
id: S-0036
type: story
nature: improvement
title: flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides
status: backlog
owner: bytepunx
created: 2026-11-15T07:27:57Z
updated: 2026-11-15T07:27:57Z
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
    time_lost_per_cycle: 16m
    by: flai
    at: 2026-11-15T07:27:57Z
---
# S-0036 flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides

## Goal

This story remediates [I-0037](../../../design/issues/I-0037-flai-stream-sync-flags-a-rebased-issue-bump-as-undoing-main-s-change-because.md), "flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0037 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0037 is closed with `flai issue close I-0037 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0037. time_lost_per_cycle 16m: 8m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-15T05:54:56Z, 0.1 days before this story; under one cycle counts as one).
