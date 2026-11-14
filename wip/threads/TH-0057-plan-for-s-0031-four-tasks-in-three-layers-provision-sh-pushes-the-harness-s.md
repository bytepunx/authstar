---
id: TH-0057
title: "Plan for S-0031: four tasks in three layers; provision.sh pushes the harness's bundles from the checkout"
anchor:
  path: wip/kanban/stories/S-0031-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md
  item: S-0031
status: open
participants: [planner-S-0031]
created: 2026-11-14T10:11:22Z
updated: 2026-11-14T10:11:22Z
---

# TH-0057 Plan for S-0031: four tasks in three layers; provision.sh pushes the harness's bundles from the checkout

On wip/kanban/stories/S-0031-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md.

## Entries

### 2026-11-14T10:11:22Z planner-S-0031
S-0031 is planned: four tasks in three layers, 1h30m, 190 USD a week. No thread named "asked" exists on S-0031, and none of the operator's entries mention it, so this is a first plan from the story and I-0014.

## Proposed fix (please confirm before you finalize the draft)

1. **Recommended:** `integration/scripts/provision.sh` stops registering `bytepunx/authstar-integration` with signet. That means no GitHub deploy key, no commit and push, and no `signet repo add` or `repo sync`. Instead it pushes the eight bundles from the checkout through `SyncBundle` with `scripts/kluster-signet-push.mjs`, as story namespaces already do (D-0036). A branch's change to `integration/config/authstar/*.yaml` then reaches any cluster the checkout provisions. Story namespaces already avoid the cause (D-0034), so only the harness's own flow is left to fix.
2. Retire `integration/scripts/up.sh`, `provision.sh`, `deploy.sh`, and `deploy-local.sh`, and point `scripts/smoke.sh` and the README at `flai kluster up` and `flai kluster promote`. This is larger, and it changes `make smoke`.
3. Register the monorepo with signet, as D-0001 first put it, with `--config-path integration/config/`. This still syncs only one branch, so a story branch's change would still not reach the cluster. It leaves the cause in place.

## Tasks and layers

| Layer | Task | Touches | After |
|-------|------|---------|-------|
| 1 | T-0155 provision.sh seeds the bundles from the checkout | `integration/scripts/provision.sh`, `lib.sh`, `lib-secrets.sh`, `scripts/kluster-signet-push.mjs` | none |
| 2 | T-0160 regression test, run from the behavior tier | `scripts/harness-config.test.mjs`, `scripts/test.sh`, `scripts/README.md` | T-0155 |
| 2 | T-0165 docs | `integration/README.md`, `design/system/overview.md` | T-0155 |
| 3 | T-0168 close I-0014, tick both criteria | `design/issues/I-0014-…`, `design/issues/summary.md` | T-0160, T-0165 |

T-0160 and T-0165 share no path, so they run together.

## Figures

- Forecast: 1h30m, raised from flai's 18m. The story has four task cycles and a close-out that runs every suite (I-0010).
- Delivery: flai's, 2026-11-16T23:29:00Z.
- Cost of delay: 190 USD a week, from flai's I-0014 input (1h16m per cycle). The input may now overstate the loss, since story namespaces avoid the cause. That input is yours to lower.

## Assumptions

- The test needs no cluster and no network (D-0026). It runs the push in `KLUSTER_DRY_RUN=1` on a temporary copy of the config, so it proves the checkout's config reaches the bundle without a live run.
- Archiving `bytepunx/authstar-integration` stays your action (D-0001, D-0006). No task touches GitHub.
- No `after` on another story: the push path S-0019 and S-0025 wrote is on main already.
