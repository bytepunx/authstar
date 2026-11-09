---
id: S-0021
type: story
nature: remediation
title: npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail
status: backlog
owner: bytepunx
created: 2026-11-09T09:04:33Z
updated: 2026-11-09T09:04:33Z
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
    time_lost_per_cycle: 20m
    by: flai
    at: 2026-11-09T09:04:33Z
---
# S-0021 npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail

## Goal

This story remediates [I-0016](../../../design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md), "npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0016 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0016 is closed with `flai issue close I-0016 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0016. time_lost_per_cycle 20m: 20m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:17:12Z, 0.1 days before this story; under one cycle counts as one).
