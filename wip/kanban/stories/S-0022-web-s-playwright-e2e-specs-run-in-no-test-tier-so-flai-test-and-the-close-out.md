---
id: S-0022
type: story
nature: remediation
title: Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e
status: backlog
owner: bytepunx
created: 2026-11-09T09:04:34Z
updated: 2026-11-09T09:04:34Z
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
    time_lost_per_cycle: 10m
    by: flai
    at: 2026-11-09T09:04:34Z
---
# S-0022 Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e

## Goal

This story remediates [I-0017](../../../design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md), "Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0017 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0017 is closed with `flai issue close I-0017 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0017. time_lost_per_cycle 10m: 10m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:17:15Z, 0.1 days before this story; under one cycle counts as one).
