---
id: S-0026
type: story
nature: remediation
title: keep's usage-updated event still carries the retired tenant scope
status: backlog
owner: bytepunx
created: 2026-11-13T12:08:12Z
updated: 2026-11-13T12:08:12Z
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
    at: 2026-11-13T12:08:12Z
---
# S-0026 keep's usage-updated event still carries the retired tenant scope

## Goal

This story remediates [I-0021](../../../design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md), "keep's usage-updated event still carries the retired tenant scope". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0021 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0021 is closed with `flai issue close I-0021 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0021. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-10T03:45:55Z, 3.3 days before this story; under one cycle counts as one).
