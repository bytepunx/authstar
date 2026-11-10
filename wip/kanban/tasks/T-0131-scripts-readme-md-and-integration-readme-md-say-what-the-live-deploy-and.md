---
id: T-0131
type: task
nature: improvement
title: scripts/README.md and integration/README.md say what the live deploy and teardown changed
status: backlog
parent: S-0025
owner: bytepunx
created: 2026-11-09T23:41:04Z
updated: 2026-11-09T23:41:04Z
transitions: []
stream: S-0025
tags: [kluster, docs, integration]
touches: [scripts/README.md, integration/README.md]
after: [T-0130]
---
# T-0131 scripts/README.md and integration/README.md say what the live deploy and teardown changed

## Work

Waits for T-0130, which waits for T-0128 and T-0129: it documents what those three changed, and they are known only once the live runs pass.

- `scripts/README.md`: add `kluster-signet-remove.mjs` to the scripts table, and rewrite the `kluster-teardown.sh` row, which says the bundles stay. Change any other row whose script a live run changed.
- `integration/README.md`, § Story namespaces through flai's `kluster:` block: rewrite the teardown row and any step the fixes changed, and add what the operator must do before the first deploy, as the live runs found it, such as `flai kluster up` and anything the cluster needed.
- Write the deploy and teardown jobs that proved the criterion in the story's Notes, under a `### Delivery` heading.

## Done when

- Both files describe the scripts as they now are, and neither says the teardown leaves the bundles
- The story's Notes name the deploy and teardown jobs that passed
- The project's markdown lint passes on both files

## Notes
