---
id: S-0028
type: story
nature: improvement
title: A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards
status: backlog
owner: bytepunx
created: 2026-11-14T08:26:33Z
updated: 2026-11-14T08:26:33Z
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
    at: 2026-11-14T08:26:33Z
---
# S-0028 A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards

## Goal

This story remediates [I-0024](../../../design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md), "A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0024 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0024 is closed with `flai issue close I-0024 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0024. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-13T21:52:05Z, 0.4 days before this story; under one cycle counts as one).
