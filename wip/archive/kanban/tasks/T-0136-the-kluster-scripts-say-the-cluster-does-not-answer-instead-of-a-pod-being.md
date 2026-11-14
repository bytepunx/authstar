---
id: T-0136
type: task
nature: feature
title: The kluster scripts say the cluster does not answer, instead of a pod being absent
status: done
parent: S-0025
owner: alex
created: 2026-11-13T12:24:34Z
updated: 2026-11-13T12:30:33Z
transitions:
  - to: ready
    at: 2026-11-13T12:24:36Z
    by: agent-S-0025
  - to: in-progress
    at: 2026-11-13T12:24:36Z
    by: agent-S-0025
  - to: done
    at: 2026-11-13T12:30:33Z
    by: agent-S-0025
stream: S-0025
tags: []
touches: [scripts/lib-kluster.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh]
usage:
  source: log
  seconds: 357
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 1
      output: 203
      cache_read: 87035
      cache_write: 2615
      cost: 0.0421
---
# T-0136 The kluster scripts say the cluster does not answer, instead of a pod being absent

## Work

Waits for no task: T-0129 is done, and the change needs no cluster.

flai serve's live teardown of S-0005 failed at 2026-11-13T12:08:29Z saying "RabbitMQ's pod rabbitmq/rabbitmq-0 is not there" (TH-0044). Main's promote a minute later failed with kubectl's own error: `dial tcp 127.0.0.1:41600: connect: connection refused`. The k3d containers restarted 21h before and the API load balancer now listens on 127.0.0.1:40820, so flai's kept `.flai-cache/kluster/kubeconfig` names a dead port. The teardown's `need_pod` threw kubectl's error away and blamed the pod.

- `kluster_need_pod` in `scripts/lib-kluster.sh` replaces the two scripts' own `need_pod` and reports kubectl's error.
- `kluster_require` checks that the cluster answers `/readyz` before any step and, when it does not, says the API port may have moved and to write the kubeconfig again with `flai kluster up`.

## Done when

- `scripts/kluster-deploy.sh` and `scripts/kluster-teardown.sh` use `kluster_need_pod`, and neither defines `need_pod`
- `kluster_require` fails, naming the context, the kubeconfig, and kubectl's error, when the cluster does not answer
- `shellcheck -x` and `sh -n` pass on the kluster scripts, and a `KLUSTER_DRY_RUN=1` teardown for `s-0025` exits 0 and still refuses `authstar`

## Notes
