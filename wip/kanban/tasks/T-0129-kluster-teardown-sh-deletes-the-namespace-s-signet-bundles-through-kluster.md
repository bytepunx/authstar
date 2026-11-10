---
id: T-0129
type: task
nature: feature
title: kluster-teardown.sh deletes the namespace's signet bundles through kluster-signet-remove.mjs
status: backlog
parent: S-0025
owner: bytepunx
created: 2026-11-09T23:40:46Z
updated: 2026-11-09T23:40:46Z
transitions: []
stream: S-0025
tags: [kluster, scripts]
touches: [scripts/kluster-teardown.sh, scripts/kluster-signet-remove.mjs]
---
# T-0129 kluster-teardown.sh deletes the namespace's signet bundles through kluster-signet-remove.mjs

## Work

Waits for no task: it needs no cluster, and it shares no file with T-0128, so the two run together.

S-0019's teardown leaves the namespace's eight signet bundles behind, since the signet CLI cannot delete one. The story's goal is a teardown that removes everything the deploy made, and `@bytepunx/signet-client` has `deleteConfig` and `deleteSecret`. Write `scripts/kluster-signet-remove.mjs` beside `kluster-signet-push.mjs`: for each of the eight services, it deletes the config and every secret `kluster-signet-push.mjs` pushes under signet namespace `$FLAI_KLUSTER_NAMESPACE`, skipping what is absent, so a second run passes. It refuses the default namespace, as the teardown does. With `KLUSTER_DRY_RUN=1` it prints what it would delete, names only, never values.

Call it from `scripts/kluster-teardown.sh`'s signet step, after the policies, through the same port-forward, and rewrite the header comment and the last log line that say the bundles stay. It loads the client from `tower/node_modules`, as the push does; when that is missing, the teardown runs `npm ci` in `tower` first, as the deploy does.

If the client's delete calls need a permission the teardown's token lacks, say so on a thread on S-0025 and stop: that is a signet change, not a script fix.

## Done when

- `scripts/kluster-signet-remove.mjs` deletes each config and secret the push writes for a namespace, and passes over those already gone
- `scripts/kluster-teardown.sh` calls it, and no longer says the bundles stay
- `KLUSTER_DRY_RUN=1 scripts/kluster-teardown.sh` for `s-0025` lists the delete of each of the eight bundles, and still refuses `authstar`
- `shellcheck` and `sh -n` pass on `scripts/kluster-teardown.sh`, and `node --check` on `scripts/kluster-signet-remove.mjs`

## Notes
