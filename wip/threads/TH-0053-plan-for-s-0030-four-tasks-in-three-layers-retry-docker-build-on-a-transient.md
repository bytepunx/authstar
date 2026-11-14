---
id: TH-0053
title: "Plan for S-0030: four tasks in three layers; retry docker build on a transient registry failure"
anchor:
  path: wip/kanban/stories/S-0030-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md
  item: S-0030
status: open
participants: [planner-S-0030]
created: 2026-11-14T10:10:16Z
updated: 2026-11-14T10:10:16Z
---

# TH-0053 Plan for S-0030: four tasks in three layers; retry docker build on a transient registry failure

On wip/kanban/stories/S-0030-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md.

## Entries

### 2026-11-14T10:10:16Z planner-S-0030
No earlier plan and no "asked" thread exist for S-0030, so this is its first plan.

## Proposed fix

`scripts/kluster-build.sh` runs `docker build` again when the build's output names a transient registry failure, such as I-0026's `failed to fetch oauth token ... unexpected EOF`. It stops after `KLUSTER_BUILD_ATTEMPTS` attempts (3), waiting `KLUSTER_BUILD_RETRY_DELAY` seconds (5, doubling) between them. Any other failure fails at once, as it does today.

## Tasks

| Layer | Task | Touches | After |
|-------|------|---------|-------|
| 1 | T-0150 kluster-build.sh retries docker build on a transient registry failure | `scripts/kluster-build.sh` | none |
| 2 | T-0152 A fake-docker test reproduces the dropped token call and runs in the test tier | `scripts/test-kluster-build.sh`, `scripts/test.sh` | T-0150 |
| 2 | T-0154 The scripts and integration READMEs describe the retry | `scripts/README.md`, `integration/README.md` | T-0150 |
| 3 | T-0161 A kluster deploy of the story passes and I-0026 is closed | I-0026's file, `design/issues/summary.md` | T-0152, T-0154 |

T-0152 and T-0154 share no file, so they can run together.

## Figures

- Forecast: 1h30m, up from flai's 12m. The close-out runs the integration and smoke tiers, and the live check is a kluster deploy of eight images.
- Cost of delay value: 37.50 USD a week, from flai's 15m input. It stands.
- Touches: seven files, no folders. No `after`.

## Assumptions

- I set aside keeping base images on the kluster host, the issue's other option. It needs a mirror or a pre-loaded image store, which is a host change and yours to make. It also would not cover a layer pull that drops mid-build.
- Retrying the whole build is cheap here: the instance failed while loading metadata, before any step ran, and BuildKit's cache covers steps that already finished.
- The manifest declares no `tests`, so `scripts/test.sh` is the one tier, and the new test runs there.

## Proposal

The 15m input understates I-0026: the failure sent S-0017 back from review (TH-0052). Raise `time_lost_per_cycle` if you agree. Nothing in this plan waits on that.
