---
id: T-0163
type: task
nature: remediation
title: A live deploy of S-0027 passes through the new check, and I-0023 is closed
status: backlog
parent: S-0027
owner: bytepunx
created: 2026-11-14T10:10:09Z
updated: 2026-11-14T10:10:09Z
transitions: []
stream: S-0027
tags: [kluster, issues]
touches: [design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md, design/issues/summary.md]
after: [T-0156, T-0159]
---
# T-0163 A live deploy of S-0027 passes through the new check, and I-0023 is closed

## Work

Waits for T-0156 and T-0159: the issue closes on the fix, its test, and its documentation together.

- Ask flai serve for S-0027's deploy job with the MCP tool `kluster_deploy` and hold `wait_for_events` until it ends. It proves the changed `kluster_require` lets a deploy through on a live port; it cannot move the port, which the test in T-0156 covers. Ask for its teardown with `kluster_teardown` after.
- Close I-0023 with `flai issue close I-0023 --reason`, saying that `kluster_require` now reads the port k3d's load balancer publishes and goes on with a kubeconfig copy, that `scripts/test-kluster-kubeconfig.sh` reproduces the moved port, and that flai's own steps still read the kept kubeconfig.

## Done when

- S-0027's `kluster_deploy` job passed, and its teardown passed, at the commit with T-0153's change; the job ids are in this task's Notes
- `flai issue close I-0023` succeeded, and `design/issues/summary.md` no longer lists I-0023 as open

## Notes
