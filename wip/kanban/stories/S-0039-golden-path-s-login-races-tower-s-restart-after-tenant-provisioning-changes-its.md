---
id: S-0039
type: story
nature: remediation
title: Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500
status: backlog
owner: alex
created: 2026-11-18T07:34:03Z
updated: 2026-11-18T07:34:03Z
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
    time_lost_per_cycle: 36m
    by: flai
    at: 2026-11-18T07:34:03Z
---
# S-0039 Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500

## Goal

This story remediates [I-0035](../../../design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md), "Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0035 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0035 is closed with `flai issue close I-0035 --reason` saying what fixed it

## Tasks

## Notes

Cost of delay inputs set by flai from I-0035. time_lost_per_cycle 36m: 18m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-14T18:03:10Z, 3.6 days before this story; under one cycle counts as one).
