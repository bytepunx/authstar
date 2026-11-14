---
id: TH-0041
title: "Plan for S-0025: four tasks in three layers; cost of delay input needed"
anchor:
  path: wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md
  item: S-0025
status: resolved
participants: [planner-S-0025, bytepunx]
created: 2026-11-09T23:42:16Z
updated: 2026-11-13T12:09:42Z
---

# TH-0041 Plan for S-0025: four tasks in three layers; cost of delay input needed

On wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md.

## Entries

### 2026-11-09T23:42:16Z planner-S-0025
**Question: cost of delay input.** Recommended: `revenue_per_week` 1200 on S-0025, the same as S-0019. S-0025 is S-0019's third criterion, moved out at your request, so E-0005's outcome is worth no more until it is done.

Alternatives:

- Set inputs on E-0005 instead, so that both stories value from the epic.
- A lower figure, if a deploy that is proven only by hand is worth something to you on its own.

flai cannot work out a value without one: S-0025 has no inputs, and E-0005 has neither inputs nor a value.

**Plan.** S-0025 had no tasks and no earlier plan. The prompt names a thread called `asked`, but none exists, so this is a first plan.

| Layer | Task | Waits for | Touches |
|-------|------|-----------|---------|
| 1 | T-0128 A live deploy into `s-0025` rolls out all eight services, and a second deploy passes | none | the deploy scripts, `lib-secrets.sh`, the 13 manifests, the 8 service configs |
| 1 | T-0129 `kluster-teardown.sh` deletes the namespace's signet bundles through a new `kluster-signet-remove.mjs` | none | `kluster-teardown.sh`, `kluster-signet-remove.mjs` |
| 2 | T-0130 A live teardown leaves nothing the deploy made, and a second teardown passes | T-0128, T-0129 | `kluster-teardown.sh`, `kluster-signet-remove.mjs`, `lib-kluster.sh` |
| 3 | T-0131 `scripts/README.md` and `integration/README.md` say what changed | T-0130 | both READMEs |

T-0128 and T-0129 share no file, so they run together.

**Story changes.**

- Touches: the eight declared ones kept. Added `scripts/kluster-signet-remove.mjs`, `integration/scripts/lib-secrets.sh`, and the manifests and service configs the deploy applies and pushes. No folder touches.
- `after: S-0019` kept. The reason is now under `### Planning`: this story reads S-0019's `kluster:` block and scripts.
- Forecast 4h, delivery 2026-11-10T22:05Z. flai gave 32m, from four done stories. The extra time covers two live fix loops over steps that have never run.

**Assumptions.**

1. You or flai serve run every `flai kluster up`, `deploy`, and `teardown` (D-0026). The story's agent asks for each run on this story and reads the job logs with `flai kluster deployments`.
2. A `flai kluster deploy S-0025` you run while the story is in progress proves "a story in review deploys". It is the same command flai serve runs when a story enters review.
3. "Its teardown removes it" includes the namespace's signet bundles. S-0019 leaves them because the signet CLI cannot delete one. `@bytepunx/signet-client` has `deleteConfig` and `deleteSecret`, so T-0129 adds that. If you want the bundles left behind, I would drop T-0129 and narrow T-0130.
4. S-0020's builds of herald, keep, steward, and web are on main, so all eight images build.

I propose no splits, merges, or drops.

### 2026-11-13T12:09:42Z bytepunx
Resolved.
