---
id: TH-0029
title: "Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed"
anchor:
  path: wip/kanban/stories/S-0019-write-the-project-s-kluster-build-deploy-and-teardown-scripts-and-name-them-in.md
  item: S-0019
status: resolved
participants: [planner-S-0019, agent-S-0019, bytepunx]
created: 2026-11-09T06:56:37Z
updated: 2026-11-09T22:29:03Z
---

# TH-0029 Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed

On wip/kanban/stories/S-0019-write-the-project-s-kluster-build-deploy-and-teardown-scripts-and-name-them-in.md.

## Entries

### 2026-11-09T06:56:37Z planner-S-0019
Two questions first, each with my recommendation.

1. **Cost of delay inputs.** Neither S-0019 nor E-0005 has any, so there is no value. Recommended: `time_lost_per_cycle: 2h`, no revenue, no penalty. Reason: until this lands, every story in review is tested against a cluster by hand or not at all. Alternatives: `1h`, or a `penalty_per_week` if E-0005 has a date.
2. **Shared services in `kluster.yaml`.** Your root `kluster.yaml` names profile `signet`, which installs only cert-manager, SPIRE, traefik, and signet. The deploy needs Postgres, RabbitMQ, ClickHouse, and Dex. Recommended: T-0093 adds `addons: [postgres, rabbitmq, clickhouse, dex]` and `trust-domain: authstar.cluster.local` to `kluster.yaml`, and each namespace gets its own vhost, prefixed databases, and signet bundles over them, as S-0575 did. kluster resolves those addon names over any profile. Profile `authstar` would also deploy authstar's `latest` images into `authstar` itself. Alternative: the deploy installs its own Postgres, RabbitMQ, ClickHouse, and Dex in each namespace. That leaves `kluster.yaml` alone but makes each deploy slower.

The tasks and their layers:

| Layer | Task | Touches |
|-------|------|---------|
| 1 | T-0087 `scripts/kluster-build.sh <service>`: builds one image, tag `FLAI_KLUSTER_TAG`, listed in `FLAI_KLUSTER_IMAGES` | `scripts/kluster-build.sh` |
| 1 | T-0088 Drift fixes: `SIGNET_ADMIN_ADDR` 8444 to 8443, and tower's `scope` as a list | five `integration/manifests/*.yaml`, `integration/config/authstar/tower.yaml` |
| 1 | T-0089 `scripts/lib-kluster.sh`: variable checks, `kubectl --context`, dry-run mode, manifest renderer, Postgres, ClickHouse, and RabbitMQ exec helpers | `scripts/lib-kluster.sh` |
| 2 | T-0090 `scripts/kluster-signet.sh`: bundles and the four cross-service policies (after T-0089) | `scripts/kluster-signet.sh` |
| 2 | T-0091 `scripts/kluster-teardown.sh`: vhost, user, prefixed databases, and policies; refuses the default namespace (after T-0089) | `scripts/kluster-teardown.sh` |
| 3 | T-0092 `scripts/kluster-deploy.sh`: namespace, vhost, databases, signet, manifests, rollouts (after T-0088, T-0089, T-0090) | `scripts/kluster-deploy.sh` |
| 4 | T-0093 The `kluster:` block through `flai manifest set`, `kluster.yaml` per question 2, and the READMEs (after T-0087, T-0091, T-0092) | `system-flow.yaml`, `kluster.yaml`, `scripts/README.md`, `integration/README.md` |

The assumptions I made:

- The block uses `components`, one build per service, so each build gets its own step and log (ADR-0263). It does not use one `build`.
- The deploy renders `integration/manifests/` with S-0575's renames into the namespace. Making the manifests themselves take the namespace as a parameter is left for later.
- The teardown cannot remove a namespace's signet bundles, because the signet CLI cannot delete them. They pile up, as S-0575 found.
- S-0575's Dex and golden-path drift is out of scope, because none of it stops a rollout. Dex is kluster's. The golden path belongs to S-0017 and S-0018.
- Criterion 3 is verified by you or by flai serve, not by the story's agent. `flai guard` refuses an agent `flai kluster deploy`, and D-0026 bars cluster commands for agents. If flai reads the block from main, S-0019 can be deployed only after it is accepted, by the next promotion and a later story's review.
- Forecast is 6h, raised from flai's 1h default because there is too little history. No `after`.

### 2026-11-09T21:59:33Z agent-S-0019 (recommendation)
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

### 2026-11-09T22:01:44Z bytepunx
Confirmed the recommendation of 2026-11-09T21:59:33Z agent-S-0019.

Source: design/digest/D-0026-agents-on-this-host-run-no-cluster-commands-its-current-kube-context-is-a.md

### 2026-11-09T22:29:03Z agent-S-0019
Resolved: The operator confirmed the recommendation: kluster.config names integration/kluster.yaml. T-0093 did this, and the root kluster.yaml is removed. The cost-of-delay inputs were set by the operator.
