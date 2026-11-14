---
id: T-0156
type: task
nature: remediation
title: A shell test reproduces a moved k3d API port with a fake kubectl and docker on PATH
status: backlog
parent: S-0027
owner: bytepunx
created: 2026-11-14T10:09:57Z
updated: 2026-11-14T10:09:57Z
transitions: []
stream: S-0027
tags: [kluster, scripts, testing]
touches: [scripts/test-kluster-kubeconfig.sh]
after: [T-0153]
---
# T-0156 A shell test reproduces a moved k3d API port with a fake kubectl and docker on PATH

## Work

Waits for T-0153: it tests the kubeconfig copy, its path, and the messages T-0153 writes.

Agents on this host run no cluster commands (D-0026), so the test needs no cluster. `scripts/test-kluster-kubeconfig.sh`, POSIX `sh` under `set -eu`, sources `scripts/lib-kluster.sh` with a scratch `PATH` holding a fake `kubectl` and a fake `docker`:

- The fake `kubectl` answers `get --raw /readyz` only when the `KUBECONFIG` it gets names the live port, and edits a kubeconfig for `config set-cluster`, or the test uses a real `kubectl` for that alone.
- The fake `docker` prints the live port for `docker port k3d-<cluster>-serverlb 6443`.
- Cases: the kept kubeconfig names a dead port and the live one is found (I-0023's case: passes, `KUBECONFIG` is the copy, the kept file is unchanged); no load balancer is found (fails naming `flai kluster up`); the kept port is live (passes with `KUBECONFIG` unchanged and no copy written).
- Everything it writes goes under a `mktemp -d` it removes on exit.

## Done when

- `sh scripts/test-kluster-kubeconfig.sh` exits 0 with T-0153's change, and its I-0023 case fails with `scripts/lib-kluster.sh` as it was before T-0153
- `shellcheck -x` and `sh -n` pass on it

## Notes
