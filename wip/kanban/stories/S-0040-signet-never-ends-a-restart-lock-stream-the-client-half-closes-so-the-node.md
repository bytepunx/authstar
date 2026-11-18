---
id: S-0040
type: story
nature: remediation
title: Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves
status: backlog
owner: bytepunx
created: 2026-11-18T12:44:30Z
updated: 2026-11-18T12:44:30Z
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
    at: 2026-11-18T12:44:30Z
---
# S-0040 Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves

## Goal

This story remediates [I-0039](../../../design/issues/I-0039-signet-never-ends-a-restart-lock-stream-the-client-half-closes-so-the-node.md), "Signet never ends a restart-lock stream the client half-closes, so the Node client's lock.release() never resolves". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0039 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0039 is closed with `flai issue close I-0039 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0039. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-18T07:44:49Z, 0.2 days before this story; under one cycle counts as one).
