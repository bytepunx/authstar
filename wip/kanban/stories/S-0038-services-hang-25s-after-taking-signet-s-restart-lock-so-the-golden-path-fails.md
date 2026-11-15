---
id: S-0038
type: story
nature: remediation
title: "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window"
status: backlog
owner: bytepunx
created: 2026-11-15T07:27:58Z
updated: 2026-11-15T07:27:58Z
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
    time_lost_per_cycle: 30m
    by: flai
    at: 2026-11-15T07:27:58Z
---
# S-0038 Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window

## Goal

This story remediates [I-0029](../../../design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md), "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0029 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0029 is closed with `flai issue close I-0029 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0029. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-14T10:51:50Z, 0.9 days before this story; under one cycle counts as one).
