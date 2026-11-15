---
id: S-0037
type: story
nature: remediation
title: "Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https"
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
    time_lost_per_cycle: 13m
    by: flai
    at: 2026-11-15T07:27:57Z
---
# S-0037 Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https

## Goal

This story remediates [I-0006](../../../design/issues/I-0006-harness-herald-yaml-and-keep-yaml-point-towerbaseurl-at-http-while-tower-serves.md), "Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0006 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0006 is closed with `flai issue close I-0006 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0006. time_lost_per_cycle 13m: 15m per occurrence × 1 occurrence ÷ 1.2 cycles of 168h (first reported 2026-11-06T18:09:52Z, 8.6 days before this story).
