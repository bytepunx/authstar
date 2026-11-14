---
id: S-0031
type: story
nature: remediation
title: "A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo"
status: backlog
owner: bytepunx
created: 2026-11-14T09:55:08Z
updated: 2026-11-14T10:15:41Z
transitions: []
tags: []
topics: [integration, signet, kluster, testing]
touches: [integration/scripts/provision.sh, integration/scripts/lib.sh, integration/scripts/lib-secrets.sh, scripts/kluster-signet-push.mjs, scripts/harness-config.test.mjs, scripts/test.sh, scripts/README.md, integration/README.md, design/system/overview.md, design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md, design/issues/summary.md]
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
      seconds: 31
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 21
          output: 4885
          cache_read: 1224122
          cache_write: 38407
          cost: 0.6715
    - kind: orchestrator
      seconds: 24
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 6
          output: 44
          cache_read: 248305
          cache_write: 26674
          cost: 0.3157
cost_of_delay:
  inputs:
    time_lost_per_cycle: 1h16m
    by: flai
    at: 2026-11-14T09:55:08Z
  value: 190
  by: planner-S-0031
  at: 2026-11-14T10:09:26Z
forecast:
  duration: 1h30m
  delivery: 2026-11-16T23:29:00Z
  basis: "flai forecast gave 18m (79 s per size unit over 5 done remediation stories, size 13); raised to 1h30m for four task cycles and a close-out that runs every project's suite (about 7m on S-0006); delivery kept from flai's pull-order position, 15th."
  by: planner-S-0031
  at: 2026-11-14T10:09:26Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:41Z
---
# S-0031 A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo

## Goal

This story remediates [I-0014](../../../design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md), "A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0014 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0014 is closed with `flai issue close I-0014 --reason` saying what fixed it

## Tasks
- T-0155 provision.sh seeds the harness's signet bundles from the checkout instead of registering bytepunx/authstar-integration
- T-0160 A test proves a checkout's harness config change reaches its signet bundle and that no harness script registers a git repository
- T-0165 integration/README.md and the system overview say the harness's signet config comes from the checkout, not a registered repository
- T-0168 Close I-0014 saying provision.sh now pushes the harness's bundles from the checkout

## Notes

Cost of delay inputs set by flai from I-0014. time_lost_per_cycle 1h16m: 38m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-09T07:16:18Z, 5.1 days before this story; under one cycle counts as one).

### Planning

Proposed fix, from I-0014's two instances and what S-0019 and S-0025 built since (D-0034, D-0036). The story namespaces flai deploys already take config from the checkout: `scripts/kluster-signet.sh` runs `scripts/kluster-signet-push.mjs`, which reads `integration/config/authstar/*.yaml` from the working tree and pushes each bundle through `SyncBundle`. What still points at the old repository is the harness's own flow, `integration/scripts/provision.sh`. Its steps 6 and 7 add a GitHub deploy key to `bytepunx/authstar-integration`, commit and push `secrets/`, `config/`, and `.sops.yaml`, and register that repository with `signet repo add --branch main`. So the fix drops those steps from `provision.sh` and seeds the eight bundles from the checkout through `SyncBundle`, reusing `kluster-signet-push.mjs` (T-0155). A test runs the push in `KLUSTER_DRY_RUN=1` on a checkout whose `portcullis.yaml` differs from main's and fails unless the change reaches the bundle. A second assertion fails if any harness script still registers a git repository with signet (T-0160). Archiving `bytepunx/authstar-integration` stays the operator's action (D-0001, D-0006). The plan's thread asks the operator to confirm this before the story is finalized.

Touches, all files, none a folder:

| Touch | Source | Why |
|-------|--------|-----|
| `integration/scripts/provision.sh` | design (I-0014, D-0034) | Registers `bytepunx/authstar-integration` as signet's repo; the fix removes that |
| `integration/scripts/lib.sh` | layout | Shared constants `provision.sh` sources; the repo-layout comment at line 20 changes |
| `integration/scripts/lib-secrets.sh` | layout | Its header and the line-141 comment describe the repo-sync flow |
| `scripts/kluster-signet-push.mjs` | design (D-0036) | The checkout-to-`SyncBundle` path `provision.sh` reuses; may need the default namespace's values without a deploy's state |
| `scripts/harness-config.test.mjs` | design | New regression test for criterion 1 |
| `scripts/test.sh` | layout | The behavior tier, which runs the new test |
| `scripts/README.md` | layout | Lists every script; gains the test's row |
| `integration/README.md` | design | Says "this git repository is the thing you register with signet" and documents steps 6 and 7 |
| `design/system/overview.md` | design | The living design says where the harness's signet config comes from |
| `design/issues/I-0014-…` | declared by criterion 2 | Closed by `flai issue close` |
| `design/issues/summary.md` | co-change | flai regenerates it when an issue closes |

`flai touches suggest` listed nothing at first, since the story declared no touches. Every touch above comes from the goal, the criteria, the issue, the digest entries it cites, and the code layout. Run again on these touches, it listed the eight `integration/config/authstar` files and the manifests. They are left out: they co-changed in bulk imports, and the test changes a temporary copy of the config, never the files themselves.

Forecast: 1h30m, delivery 2026-11-16T23:29:00Z. `flai forecast` gave 18m: 79 s per unit of size over 5 done remediation stories, times size 13. That is raised, because the story has four task cycles and a close-out that runs every project's suite (I-0010), which took about 7m on S-0006. The delivery is flai's, from the story's 15th place in the pull order.

Cost of delay value: 190 USD a week, as `flai cod` works it out from the inputs flai set from I-0014 (1h16m lost per 168h cycle at 150 USD an hour). It stands. The story namespaces already avoid the cause, so the time lost per cycle may now be lower than the input says, but that input is the operator's to change.

No `after`: the story reads `kluster-signet-push.mjs` and D-0036's push path, which S-0019 and S-0025 wrote and which are on main already.
