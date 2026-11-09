---
id: S-0023
type: story
nature: remediation
title: "Herald's retention-purge spec fails intermittently with \"NTP clock skew detected\" from node-flakes"
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
# S-0023 Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Goal

This story remediates [I-0018](../../../design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md), "Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0018 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0018 is closed with `flai issue close I-0018 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0018. time_lost_per_cycle 10m: 10m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:58:27Z, 0 days before this story; under one cycle counts as one).
