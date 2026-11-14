---
id: S-0029
type: story
nature: remediation
title: Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials
status: backlog
owner: bytepunx
created: 2026-11-14T09:30:30Z
updated: 2026-11-14T09:30:30Z
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
    at: 2026-11-14T09:30:30Z
---
# S-0029 Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials

## Goal

This story remediates [I-0025](../../../design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md), "Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0025 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0025 is closed with `flai issue close I-0025 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0025. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-13T22:23:24Z, 0.5 days before this story; under one cycle counts as one).
