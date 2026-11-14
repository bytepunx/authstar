---
id: T-0165
type: task
nature: remediation
title: integration/README.md and the system overview say the harness's signet config comes from the checkout, not a registered repository
status: backlog
parent: S-0031
owner: bytepunx
created: 2026-11-14T10:10:14Z
updated: 2026-11-14T10:10:14Z
transitions: []
stream: S-0031
tags: [integration, docs]
touches: [integration/README.md, design/system/overview.md]
after: [T-0155]
---
# T-0165 integration/README.md and the system overview say the harness's signet config comes from the checkout, not a registered repository

## Work

Document the flow T-0155 builds. This task waits for T-0155 because it describes what `provision.sh` does after that change. It shares no path with T-0160, so the two run together.

- `integration/README.md`: rewrite the opening's "this git repository is the thing you register with signet" and the "Provisioning + deployment flow" steps 6 and 7. Say that `provision.sh` pushes each bundle from the checkout through `SyncBundle` with `scripts/kluster-signet-push.mjs`, as the story namespaces' deploy does. Say that no repository is registered with signet. Say that a branch's change to `config/authstar/*.yaml` reaches the cluster at the next `provision.sh` or `flai kluster deploy`. Mark the passage near line 590 about `bytepunx/authstar-integration` receiving pushes as history. Leave the rest of the history sections as they are.
- `design/system/overview.md`: in the section that covers signet and the harness, say where the harness's config and secrets come from. Bump `updated`.
- Archiving `bytepunx/authstar-integration` stays the operator's action (D-0001, D-0006). Say so where the README names the old repository, and change nothing on GitHub.

## Done when

- Neither document says signet syncs the harness from `bytepunx/authstar-integration` or any registered repository.
- `scripts/lint-md.sh` passes on both files.

## Notes
