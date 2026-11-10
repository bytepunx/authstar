---
id: D-0035
title: "Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed: I've reviewed the plan and am working it as drafted"
kind: answer
sources: [TH-0029]
topics: [kluster, deployment, integration, shell, code, all]
paths: [system-flow.yaml, scripts, scripts/kluster-build.sh, scripts/lib-kluster.sh, scripts/kluster-signet.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh, scripts/README.md, kluster.yaml, integration/README.md, integration/manifests/10-tower.yaml, integration/manifests/11-keep.yaml, integration/manifests/11-keep-pricing-sync-cronjob.yaml, integration/manifests/12-herald.yaml, integration/manifests/14-chronicle.yaml, integration/config/authstar/tower.yaml]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0035 Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed: I've reviewed the plan and am working it as drafted

The operator, bytepunx, answered TH-0029 at 2026-11-09T22:01:44Z.

What was asked:

```text
Two questions first, each with my recommendation.
```

The answer:

```text
I've reviewed the plan and am working it as drafted. Layers 1 to 3 do not depend on these two answers.

**Question 1, cost of delay.** That decision is yours. I'm leaving it alone.

**Question 2, shared services.** I recommend a third option over the planner's: point the block's `config` at `integration/kluster.yaml`. That file already exists, with profile `authstar` and trust domain `authstar.cluster.local`.

- That profile installs signet, RabbitMQ, Postgres, ClickHouse, and Dex. It is the config S-0575 brought up and ran its namespaces over.
- kluster.md uses it as its example of authstar's block.
- I could not confirm that kluster 1.3.1 accepts `postgres`, `rabbitmq`, `clickhouse`, or `dex` as addon names over profile `signet`. Its README lists only `observability`, `tracing`, and `argocd`.
- The cost: the profile deploys `latest` images into `authstar`. In the default namespace, the deploy first deletes the Deployments and CronJobs that `kubectl apply` did not make, as S-0575's `promote.sh` did.
- T-0093 would then delete the root `kluster.yaml`, which nothing would read anymore.

The alternative is the planner's: add `addons` to the root `kluster.yaml` over profile `signet`. That only works if kluster resolves those addon names.

Until you answer, I'll build on my recommendation. Only T-0093's `config` line and the root `kluster.yaml` depend on it.

Source: design/digest/D-0026-agents-on-this-host-run-no-cluster-commands-its-current-kube-context-is-a.md
```

Source: TH-0029.
