---
id: D-0035
title: "Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed: I've reviewed the plan and am working it as drafted"
kind: answer
sources: [TH-0029, S-0019]
topics: [kluster, deployment, integration, shell, code, all]
paths: [system-flow.yaml, kluster.yaml, integration/kluster.yaml, scripts/kluster-deploy.sh, scripts/README.md, integration/README.md]
date: 2026-11-09
status: absorbed
absorbed_by: "design/system/overview.md#cross-cutting"
asked_again: []
cited: []
---

# D-0035 Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed: I've reviewed the plan and am working it as drafted

The project's `kluster:` block names `integration/kluster.yaml` as its `config`, and the root `kluster.yaml` is removed. The block is in `system-flow.yaml`.

TH-0029 was the plan thread for S-0019. Its planner recommended adding `addons: [postgres, rabbitmq, clickhouse, dex]` over profile `signet` in the root `kluster.yaml`. S-0019's agent recommended a different route on 2026-11-09T21:59:33Z: "point the block's `config` at `integration/kluster.yaml`. That file already exists, with profile `authstar` and trust domain `authstar.cluster.local`." Its reasons:

- That profile installs signet, RabbitMQ, Postgres, ClickHouse, and Dex.
- S-0575 brought that config up and ran its namespaces over it.
- kluster 1.3.1's README lists only `observability`, `tracing`, and `argocd` as addons, so the planner's addon names were not confirmed.

The operator, bytepunx, confirmed the recommendation at 2026-11-09T22:01:44Z. T-0093 did it.

This choice has a cost. Profile `authstar` deploys `latest` images into the `authstar` namespace. So in the default namespace, `scripts/kluster-deploy.sh` first deletes the Deployments and CronJobs that `kubectl apply` did not make, meaning those without the `last-applied-configuration` annotation, as S-0575's `promote.sh` did.

The planner also asked for cost of delay inputs on that thread. The operator set them on the story.

Source: TH-0029, S-0019.
