---
id: T-0153
type: task
nature: remediation
title: kluster_require writes a kubeconfig with the API port k3d publishes now when the kept one's port is dead
status: backlog
parent: S-0027
owner: bytepunx
created: 2026-11-14T10:09:47Z
updated: 2026-11-14T10:09:47Z
transitions: []
stream: S-0027
tags: [kluster, scripts]
touches: [scripts/lib-kluster.sh]
---
# T-0153 kluster_require writes a kubeconfig with the API port k3d publishes now when the kept one's port is dead

## Work

Waits for no task: it is the fix the others test, document, and prove.

When the k3d containers restart, the API load balancer moves to a new host port (127.0.0.1:41600 to 127.0.0.1:40820 in I-0023), and flai's kept `.flai-cache/kluster/kubeconfig` names the dead one. `kluster_require` in `scripts/lib-kluster.sh` already checks `/readyz` and dies saying to run `flai kluster up` (T-0136).

- When `/readyz` does not answer, read the port the cluster's server load balancer publishes for 6443 now with `docker port`. Find the container from `FLAI_KLUSTER_CONTEXT` (`k3d-<cluster>` names the cluster `<cluster>`, its load balancer `k3d-<cluster>-serverlb`), or by k3d's labels.
- Copy `$KUBECONFIG` to a file under `$FLAI_KLUSTER_STATE`, mode 600, set the context's cluster `server` to the new port there with `kubectl config set-cluster`, export `KUBECONFIG` to the copy, log one line naming the old and new port, and check `/readyz` again.
- Never write flai's kept kubeconfig. Run no `k3d` or `kluster` command: `docker port` reads, it changes nothing.
- When `docker` is missing, the container is not found, or the second check fails too, die as today, naming kubectl's error and `flai kluster up`.
- A dry run stays clusterless: it returns before the check, as now.

## Done when

- With the kept kubeconfig's port dead and the load balancer publishing another, `kluster_require` returns 0 with `KUBECONFIG` pointing at a copy under `$FLAI_KLUSTER_STATE` that names the live port, and the kept file is unchanged
- With no live port to find, it fails naming the context, the kubeconfig, kubectl's error, and `flai kluster up`
- `shellcheck -x` and `sh -n` pass on `scripts/lib-kluster.sh` and the scripts that source it

## Notes
