---
id: S-0039
type: story
nature: remediation
title: Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500
status: backlog
owner: alex
created: 2026-11-18T07:34:03Z
updated: 2026-11-18T07:34:30Z
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

I-0035 is main's record of the defect S-0014 recorded as I-0030, "The golden path logs in while tower's signet-coordinated restart after provisioning is under way, so the portcullis callback gets a 500". I-0030 is not on main: read it on `story/S-0014`, in `.flai-cache/worktrees/S-0014/design/issues/`, with `git show story/S-0014:design/issues/I-0030-the-golden-path-logs-in-while-tower-s-signet-coordinated-restart-after.md`. Its three instances show the race is wider than the login in step 2:

- Step 1's provisioning changes tower's signet bundle, and tower restarts while step 2 logs in (portcullis callback 500).
- Step 5's herald key rotation changes the bundle again, and tower restarts while chronicle's auth-funnel report resolves the tenant's domain (401).
- A run that stops before the rotation leaves tower holding its ephemeral herald key, so the next run's herald send-and-verify fails (`oaep decoding error`).

So `integration/scripts/scenario-golden-path.sh` must wait for every signet-coordinated restart it sets off, not only the one after step 1. Both issues suggest waiting for tower's rollout or its readiness before the next step. The failed runs are on TH-0061, TH-0064, and TH-0065, and in D-0056.

S-0038 shortens the restart window itself (I-0029, and I-0031 on `story/S-0014`). This story makes the golden path correct whatever the window's length, so neither waits for the other.

## Acceptance criteria
- [ ] The cause I-0035 describes no longer occurs, with a test that reproduces it where one fits
- [ ] The golden path waits for each signet-coordinated restart it sets off, after provisioning and after herald's key rotation, before the step that follows
- [ ] The kluster golden-path check passes on a fresh namespace's first run and on a rerun with no redeploy
- [ ] I-0035 is closed with `flai issue close I-0035 --reason` saying what fixed it, and the reason names I-0030 as the same defect

## Tasks

## Notes

Cost of delay inputs set by flai from I-0035. time_lost_per_cycle 36m: 18m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-14T18:03:10Z, 3.6 days before this story; under one cycle counts as one).

I-0030 on `story/S-0014` adds three occurrences at 32m each that I-0035's count does not carry. When S-0014 is accepted, I-0030 reaches main: close it as a duplicate of I-0035, or with the same reason if this story is done by then.
