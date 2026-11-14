---
id: S-0029
type: story
nature: remediation
title: Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials
status: backlog
owner: bytepunx
created: 2026-11-14T09:30:30Z
updated: 2026-11-14T10:15:33Z
transitions: []
tags: [tower, signet]
topics: [signet, key-rotation]
touches: [tower/src/routes/rotate-keys.ts, tower/src/lib/signet-admin.ts, tower/src/actors/tenant_actor.ts, tower/src/routes/provisioning.ts, tower/spec/lib/fakes.ts, tower/spec/behavior/rotate-keys.spec.ts, tower/spec/behavior/signet-admin.spec.ts, tower/spec/behavior/provisioning.spec.ts, tower/TESTING.md, integration/scripts/scenario-golden-path.sh, integration/README.md, design/adrs/0113-tower-prunes-portcullis-key-generations-from-its-own-record.md, design/adrs/README.md, design/stories/tower/011-tenant-management-and-key-rotation.md, design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md, design/issues/summary.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 98
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 26
          output: 9572
          cache_read: 1392038
          cache_write: 50281
          cost: 0.8722
    - kind: orchestrator
      seconds: 86
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 20
          output: 136
          cache_read: 688802
          cache_write: 90742
          cost: 0.8908
cost_of_delay:
  inputs:
    time_lost_per_cycle: 30m
    by: flai
    at: 2026-11-14T09:30:30Z
  value: 75
  by: planner-S-0029
  at: 2026-11-14T10:11:22Z
forecast:
  duration: 3h
  delivery: 2026-11-17T02:46:00Z
  basis: flai's 24m (79 s per unit of size over 5 done remediation stories, size 18) raised to 3h for five tasks, a new tenant-actor event, an ADR, and a kluster deploy and checks run for the live step, with delivery moved later by the same 2h36m.
  by: planner-S-0029
  at: 2026-11-14T10:11:22Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:33Z
---
# S-0029 Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials

## Goal

This story remediates [I-0025](../../../design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md), "Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0025 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0025 is closed with `flai issue close I-0025 --reason` saying what fixed it

## Tasks
- T-0151 An ADR records that tower prunes portcullis's key generations from its own record and never reads portcullis's config
- T-0157 Tower's tenant actor records the key generations tower writes to portcullis's config
- T-0166 Rotate-keys prunes from tower's record, and tower's signet client drops getConfig
- T-0169 The golden-path scenario rotates the new tenant's identity-hash key and finds no prune failure in tower's log
- T-0170 Close I-0025 with what fixed it

## Notes

Cost of delay inputs set by flai from I-0025. time_lost_per_cycle 30m: 30m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-13T22:23:24Z, 0.5 days before this story; under one cycle counts as one).

### Planning

Proposed fix, pending the operator on the plan thread: tower stops reading portcullis's config. Its tenant actor records the key generations tower writes, and rotate-keys prunes from that record with `test`-guarded removals. Signet's workload listener admits only SyncBundle, PatchServiceConfig, PutServiceConfig, and GetSOPSPublicKey (`workloadGitOpsScopeAllowedMethods`, signet's `server/internal/server/server.go`), so a fix in signet is a change to another repository.

Where each touch came from:

| Touch | Source |
|-------|--------|
| `tower/src/routes/rotate-keys.ts`, `tower/src/lib/signet-admin.ts` | design: I-0025 names both |
| `tower/src/actors/tenant_actor.ts` | layout: the tenant's key-generation record |
| `tower/src/routes/provisioning.ts`, `tower/spec/lib/fakes.ts`, `tower/spec/behavior/rotate-keys.spec.ts`, `tower/spec/behavior/signet-admin.spec.ts`, `tower/spec/behavior/provisioning.spec.ts`, `tower/TESTING.md` | co-change with the two files above (`flai touches suggest`, 20–40%) |
| `integration/scripts/scenario-golden-path.sh`, `integration/README.md` | layout: the live check on a real signet |
| `design/adrs/0113-tower-prunes-portcullis-key-generations-from-its-own-record.md`, `design/adrs/README.md`, `design/stories/tower/011-tenant-management-and-key-rotation.md` | design: ADR-0103 and story 011 state what the fix changes; 0113 is a predicted number |
| `design/issues/I-0025-…md`, `design/issues/summary.md` | criterion 2 |

Left out: `tower/package.json` and its lock, `tower/src/lib/build-app.ts`, and `tower/src/server.ts`, which co-change with the signet client but need no change here, since no dependency or wiring changes.

No folder touches and no `after`: the story reads no other story's output.

Figures:

- Forecast 3h, raised from flai's 24m: five tasks, a new tenant-actor event, an ADR, and a kluster deploy and checks run, which took S-0006 about 20 minutes alone. Delivery moved later by the same 2h36m.
- Cost of delay 75 USD a week, as `flai cod` gives from the inputs: 30m lost per 168h cycle at 150 USD an hour. Not adjusted. The defect is silent: rotations succeed and never prune, so past-retention keys stay valid. No live rotation has run yet.
