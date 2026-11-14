---
id: T-0159
type: task
nature: remediation
title: scripts/README.md and integration/README.md say the kluster scripts follow a moved API port themselves
status: backlog
parent: S-0027
owner: bytepunx
created: 2026-11-14T10:10:01Z
updated: 2026-11-14T10:10:01Z
transitions: []
stream: S-0027
tags: [kluster, docs]
touches: [scripts/README.md, integration/README.md]
after: [T-0153]
---
# T-0159 scripts/README.md and integration/README.md say the kluster scripts follow a moved API port themselves

## Work

Waits for T-0153: it describes what T-0153's change does and where its kubeconfig copy lives.

- `scripts/README.md`: the `lib-kluster.sh` row says that when the cluster does not answer, the check reads the port k3d's load balancer publishes now and goes on with a kubeconfig copy under `$FLAI_KLUSTER_STATE`, and add a row for `test-kluster-kubeconfig.sh`.
- `integration/README.md`, the paragraph on a stale kubeconfig in its kluster section: the deploy, the teardown, and main's promote now follow a moved API port themselves; `flai kluster up` is still the remedy when they cannot find the port, and for flai's own steps that read the kept kubeconfig.

## Done when

- Both files say what the scripts do with a moved API port, and when `flai kluster up` is still needed, naming I-0023
- `scripts/lint-md.sh` passes on both

## Notes
