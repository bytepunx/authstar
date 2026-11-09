---
id: T-0089
type: task
nature: feature
title: scripts/lib-kluster.sh gives the kluster scripts their variables, renderer, and shared-service helpers
status: backlog
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:54:42Z
updated: 2026-11-09T06:54:42Z
transitions: []
stream: S-0019
tags: [kluster, scripts]
touches: [scripts/lib-kluster.sh]
---
# T-0089 scripts/lib-kluster.sh gives the kluster scripts their variables, renderer, and shared-service helpers

## Work

Write `scripts/lib-kluster.sh`, sourced by the deploy, signet, and teardown scripts, POSIX `sh`:

- `kluster_require`: checks `FLAI_KLUSTER_NAMESPACE`, `FLAI_KLUSTER_PREFIX`, `FLAI_KLUSTER_TAG`, `FLAI_KLUSTER_STATE`, `FLAI_KLUSTER_CONTEXT`, and `KUBECONFIG` are set (the prefix may be empty only for the default namespace), and that `kubectl` and `docker` are on `PATH`.
- `kc`: `kubectl --context "$FLAI_KLUSTER_CONTEXT"`, never the host's current context, which is a remote cluster (D-0026).
- `KLUSTER_DRY_RUN=1`: `kc` and the exec helpers print the command instead of running it, so the scripts can be checked with no cluster.
- `kluster_render <file>`: prints a manifest of `integration/manifests/` with S-0575's renames: `namespace: authstar`, `name: authstar`, and `value: authstar` to the namespace; `.authstar.svc.cluster.local` to `.<namespace>.svc.cluster.local`; `image: bytepunx/authstar-<service>:latest` to `docker.io/bytepunx/authstar-<service>:$FLAI_KLUSTER_TAG`; `imagePullPolicy: Always` to `IfNotPresent`; the `dockerhub-pull` `imagePullSecrets` dropped.
- `pg_exec`, `ch_exec`, `rmq_exec`: `psql`, `clickhouse-client`, and `rabbitmqctl` through `kc exec` into the shared services' pods, by the namespaces and pod names kluster's addons make (S-0575: `postgres/postgresql-0`, `clickhouse/clickhouse-shard0-0`, `rabbitmq/rabbitmq-0`).

Waits for no task: the scripts that source it wait for it instead.

## Done when

- `shellcheck` and `sh -n` pass on the file.
- `kluster_render` of every `integration/manifests/1[0-7]-*.yaml` for `s-0019` and tag `s-0019-test` names no `authstar` namespace, no `:latest` image, and no `Always` pull policy, checked with `grep`.

## Notes

The renames are S-0575's, written out in its results under `## What was done` › `### Story namespaces` in system-flow's `design/experiments`. The shared services' pods exist only once `kluster.yaml` names the addons that make them; the plan's thread asks the operator which.
