---
id: S-0034
type: story
nature: improvement
title: "herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew"
status: backlog
owner: bytepunx
created: 2026-11-15T07:27:56Z
updated: 2026-11-15T07:27:56Z
transitions: []
tags: []
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
draft: true
---
# S-0034 herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew

## Goal

This story remediates [I-0033](../../../design/issues/I-0033-herald-keep-and-tower-throw-on-a-backward-wall-clock-step-in-production-node.md), "herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0033 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0033 is closed with `flai issue close I-0033 --reason` saying what fixed it

## Tasks

## Notes

I-0033's cost "0m" is not a duration longer than zero, so no time_lost_per_cycle was derived from it.
