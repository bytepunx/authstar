---
id: TH-0029
title: "Plan for S-0019: seven tasks in four layers; cost of delay inputs and kluster.yaml's shared services needed"
anchor:
  path: wip/kanban/stories/S-0019-write-the-project-s-kluster-build-deploy-and-teardown-scripts-and-name-them-in.md
  item: S-0019
status: open
participants: [planner-S-0019]
created: 2026-11-09T06:56:37Z
updated: 2026-11-09T06:56:37Z
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
