---
id: T-0092
type: task
nature: feature
title: scripts/kluster-deploy.sh deploys a build into FLAI_KLUSTER_NAMESPACE over the shared services
status: done
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:55:12Z
updated: 2026-11-09T22:26:16Z
transitions:
  - to: ready
    at: 2026-11-09T22:09:04Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T22:09:04Z
    by: agent-S-0019
  - to: done
    at: 2026-11-09T22:26:16Z
    by: agent-S-0019
stream: S-0019
tags: [kluster, scripts]
touches: [scripts/kluster-deploy.sh]
after: [T-0088, T-0089, T-0090]
usage:
  source: log
  seconds: 1032
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 19
      output: 6079
      cache_read: 1782625
      cache_write: 26152
      cost: 0.6611
---
# T-0092 scripts/kluster-deploy.sh deploys a build into FLAI_KLUSTER_NAMESPACE over the shared services

## Work

Write `scripts/kluster-deploy.sh`, sourcing `scripts/lib-kluster.sh`, for the kluster block's `deploy`. It does S-0575's `ns-up.sh` steps after the load, which flai does itself, each idempotent so a deploy at a new commit updates the namespace in place:

1. Apply the rendered `integration/manifests/00-namespace.yaml`: the namespace and its eight service accounts.
2. RabbitMQ: `add_vhost <namespace>`, `add_user <namespace>` with a password generated once and kept in `$FLAI_KLUSTER_STATE`, and `set_permissions` on that vhost alone.
3. Databases: `<prefix>tower`, `<prefix>keep`, and `<prefix>herald` in Postgres and `<prefix>chronicle` in ClickHouse, each created only when absent. `01-db-init-job.yaml` is not used: it makes the fixed names.
4. Signet: `scripts/kluster-signet.sh`, with the vhost's URL.
5. Apply the rendered `integration/manifests/1[0-7]-*.yaml` and wait with `kubectl rollout status` for each of the eight Deployments, within the block's timeout.

In the default namespace, with an empty prefix, the same steps make main's own names, so a promotion needs nothing else. Say each step as it starts, so the step's log in `.flai-cache/kluster/logs` reads as the run.

Waits for T-0089 for its helpers, T-0090 for the signet step it calls, and T-0088 for the manifests it applies, without which tower never rolls out.

## Done when

- `shellcheck` and `sh -n` pass.
- With `KLUSTER_DRY_RUN=1` for `s-0019` and for the default namespace `authstar`, it prints the five steps in order with the namespace's names and prefix, and the default namespace's with no prefix.

## Notes

The run against a real cluster is the operator's or flai serve's: agents on this host run no cluster commands (D-0026), and `flai guard` refuses an agent `flai kluster deploy`.
