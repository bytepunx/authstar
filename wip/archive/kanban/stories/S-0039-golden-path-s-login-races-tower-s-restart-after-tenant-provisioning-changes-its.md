---
id: S-0039
type: story
nature: remediation
title: Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500
status: done
owner: alex
created: 2026-11-18T07:34:03Z
updated: 2026-11-18T12:44:14Z
transitions:
  - to: ready
    at: 2026-11-18T07:39:49Z
    by: alex
  - to: in-progress
    at: 2026-11-18T07:41:13Z
    by: agent-S-0039
  - to: review
    at: 2026-11-18T08:44:13Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T12:44:14Z
    by: bytepunx
tags: []
topics: [integration, kluster, testing]
touches: [integration/scripts/scenario-golden-path.sh, integration/scripts/lib.sh, integration/README.md, design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md, design/issues/summary.md, design/issues/I-0040-a-redeploy-into-a-namespace-with-running-services-replaces-their-signet-bundles.md, scripts/kluster-deploy.sh]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 3792
  priced_by: harness
  empty_wakes: 1
  turns:
    - day: 2026-11-18
      ceremony: 1
      empty_wakes: 1
      hand_edits: 1
      work: 114
  models:
    - model: claude-opus-5-5
      input: 248
      output: 55005
      cache_read: 27324854
      cache_write: 311335
      cost: 9.0567
  strategic:
    - kind: planner
      seconds: 2
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 3
          output: 968
          cache_read: 125133
          cache_write: 5565
          cost: 0.0889
    - kind: orchestrator
      seconds: 115
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 64
          output: 559
          cache_read: 1969486
          cache_write: 289244
          cost: 2.4946
cost_of_delay:
  inputs:
    time_lost_per_cycle: 36m
    by: flai
    at: 2026-11-18T07:34:03Z
  value: 90
  by: planner-S-0039
  at: 2026-11-18T07:38:35Z
forecast:
  duration: 2h
  delivery: 2026-12-04T12:07:00Z
  basis: "flai's 19m from the remediation median, raised to 2h for a fresh kluster deploy, two checks runs, and one likely fix-and-rerun round; delivery is flai's, set by the story's 18th place in the pull order"
  by: planner-S-0039
  at: 2026-11-18T07:38:35Z
finalized:
  by: alex
  at: 2026-11-18T07:39:49Z
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
- [x] The cause I-0035 describes no longer occurs, with a test that reproduces it where one fits
- [x] The golden path waits for each signet-coordinated restart it sets off, after provisioning and after herald's key rotation, before the step that follows
- [x] The kluster golden-path check passes on a fresh namespace's first run and on a rerun with no redeploy
- [x] I-0035 is closed with `flai issue close I-0035 --reason` saying what fixed it, and the reason names I-0030 as the same defect

## Tasks
- T-0178 Add a helper to lib.sh that waits for a workload's signet-coordinated restart
- T-0180 Golden path waits for tower's and portcullis's restarts after provisioning, before the login
- T-0182 Golden path waits for herald's and tower's restarts after the key rotation, before the invite
- T-0183 Integration README says the golden path waits for the restarts it sets off
- T-0185 Pass the kluster golden-path check on a fresh namespace and a rerun, then close I-0035
- T-0186 Kluster deploy waits for the signet-coordinated restarts its signet step sets off (I-0040)

## Notes

Cost of delay inputs set by flai from I-0035. time_lost_per_cycle 36m: 18m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-14T18:03:10Z, 3.6 days before this story; under one cycle counts as one).

I-0030 on `story/S-0014` adds three occurrences at 32m each that I-0035's count does not carry. When S-0014 is accepted, I-0030 reaches main: close it as a duplicate of I-0035, or with the same reason if this story is done by then.

### Verification

Criterion 3 was met on `s-0039` at 19867b9. The namespace was not new: its first deploy was interrupted, and its first checks run failed before the golden path reached tower (I-0040, fixed here as T-0186). That run's first call to tower failed in the TLS handshake, so the acme tenant was never provisioned. The next run was the golden path's first against fresh tenant state: provisioning answered 201, and it passed 11/11 after waiting 41s for tower's restart. A rerun with no redeploy passed 11/11 too.

A rerun pays the settle window at each wait whose step changed no bundle: about 90s at step 1, where neither tower nor portcullis restarts. A deploy pays it for each of the five workloads that does not restart.

### Planning

Touches, file by file, none of them a folder:

| Touch | Source | Why |
|-------|--------|-----|
| `integration/scripts/scenario-golden-path.sh` | design | The Goal names it; the waits go in steps 1 and 5. |
| `integration/scripts/lib.sh` | layout | The scenario sources it; the restart-wait helper goes beside `log` and `die`. |
| `integration/README.md` | co-change | 5 of the script's 10 commits changed it; its golden-path section describes the steps. |
| `design/issues/I-0035-…` and `design/issues/summary.md` | design | Criterion 4 closes I-0035; flai rewrites both. |

`flai touches suggest` also listed `integration/scripts/deploy-local.sh` (2 of 10). It is left out: the fix changes no deploy.

The bundles each step changes, read from the code:

- Step 1: portcullis's and tower's (`tower/src/routes/provisioning.ts`).
- Step 5: herald's and tower's (`herald/src/routes/operator-rotate-keys.ts`).

Each of these workloads restarts under signet's fleet-wide restart lock (`tower/src/server.ts`, `portcullis/crates/authstar-proxy/src/main.rs`).

Forecast: flai gave 19m, from the median of 126 s per unit over 9 done remediation stories, times size 9. It is raised to 2h. The script change is small, but criterion 3 needs a fresh kluster deploy and two checks runs. The deploy's timeout is 30m. S-0014's runs show a failed run costs a round of fix, deploy, and checks. The delivery stays flai's, 2026-12-04T12:07:00Z: it rests on the story's 18th place in the pull order, which 2h barely moves.

Cost of delay: 90 USD a week, as `flai cod` works out from the 36m input at 150 USD an hour. It stands as computed. I-0030's three uncounted occurrences, at 32m each, would raise the input to 2h12m and the value to 330 USD a week. The input is the operator's, so the plan thread raises it.

No `after`: the story reads no other story's output. S-0038 changes the restart window in the services, not the script, and the Goal says neither waits for the other.
