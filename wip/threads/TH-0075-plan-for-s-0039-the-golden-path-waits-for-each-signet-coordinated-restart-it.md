---
id: TH-0075
title: "Plan for S-0039: the golden path waits for each signet-coordinated restart it sets off"
anchor:
  path: wip/kanban/stories/S-0039-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md
  item: S-0039
status: resolved
participants: [planner-S-0039, agent-S-0039, bytepunx]
created: 2026-11-18T07:38:50Z
updated: 2026-11-18T07:50:09Z
---

# TH-0075 Plan for S-0039: the golden path waits for each signet-coordinated restart it sets off

On wip/kanban/stories/S-0039-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md.

## Entries

### 2026-11-18T07:38:50Z planner-S-0039
S-0039 is planned. It has five tasks in four layers, and its touches, forecast, and cost of delay are set.

## Proposed fix

The golden path marks each workload whose signet bundle a step changes. It then waits for that workload's restart to finish before the next step. If no restart begins within a settle window, it goes on.

- Step 1 changes portcullis's and tower's bundles (`tower/src/routes/provisioning.ts`).
- Step 5's rotation changes herald's and tower's (`herald/src/routes/operator-rotate-keys.ts`).

Waiting after the rotation and before the invite also fixes the third instance: tower encrypts the invite with the rotated key, not its ephemeral one.

## Tasks and layers

| Layer | Task | Touches | After |
|-------|------|---------|-------|
| 1 | T-0178 Helper in lib.sh that waits for a workload's restart | `integration/scripts/lib.sh` | none |
| 2 | T-0180 Wait for tower and portcullis after provisioning | `integration/scripts/scenario-golden-path.sh` | T-0178 |
| 3 | T-0182 Wait for herald and tower after the rotation, before the invite | `integration/scripts/scenario-golden-path.sh` | T-0180 |
| 4 | T-0183 README's golden-path section | `integration/README.md` | T-0182 |
| 4 | T-0185 Kluster check, fresh and rerun, then close I-0035 | I-0035, `design/issues/summary.md` | T-0182 |

T-0182 waits for T-0180 because both change the scenario script. T-0183 and T-0185 share no path, so they run together.

## Figures

- Forecast: 2h, raised from flai's 19m for a fresh kluster deploy, two checks runs, and one likely fix round. Delivery is flai's, 2026-12-04T12:07:00Z.
- Cost of delay: 90 USD a week, from the 36m input.

## Assumptions

- The fresh namespace's first run is the test that reproduces I-0035. Tower's 27-second hang (I-0031) stays on main until S-0038 lands, so that run passes only if the scenario waits. No shell test tier exists for `integration/`, so the plan adds no separate unit test.
- A container restarted in place keeps its pod. The scenario still checks its port-forwards after each wait and restarts a dead one.
- On a rerun that finds the tenant provisioned, step 1 may change no bundle. The settle window, 45s by default, then lets the run go on.
- No `after` on S-0038: this story reads nothing S-0038 writes.

## For the operator

The cost of delay input counts only I-0035's two occurrences. I-0030's three occurrences on `story/S-0014`, at 32m each, are not counted. My recommendation: leave `time_lost_per_cycle` at 36m until S-0014 lands and I-0030 is merged into I-0035. Counting them now would make it 2h12m and the value 330 USD a week. The plan needs no answer to go on.

### 2026-11-18T07:44:14Z agent-S-0039
Plan kept as written, with one addition: the helper also counts a container turning NotReady as the restart beginning, since tower's readiness probe marks it NotReady about 15s into its restart-lock hang. The cost-of-delay question stays the operator's; the work goes on without it.

### 2026-11-18T07:50:09Z bytepunx
Resolved.
