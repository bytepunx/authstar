---
id: S-0027
type: story
nature: remediation
title: flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves
status: backlog
owner: bytepunx
created: 2026-11-14T08:26:32Z
updated: 2026-11-14T08:26:32Z
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
    time_lost_per_cycle: 40m
    by: flai
    at: 2026-11-14T08:26:32Z
---
# S-0027 flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves

## Goal

This story remediates [I-0023](../../../design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md), "flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0023 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0023 is closed with `flai issue close I-0023 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0023. time_lost_per_cycle 40m: 20m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-13T12:32:47Z, 0.8 days before this story; under one cycle counts as one).
