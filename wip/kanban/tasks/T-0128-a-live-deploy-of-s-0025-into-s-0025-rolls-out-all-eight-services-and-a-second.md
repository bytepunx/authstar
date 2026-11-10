---
id: T-0128
type: task
nature: remediation
title: A live deploy of S-0025 into s-0025 rolls out all eight services, and a second deploy passes
status: backlog
parent: S-0025
owner: bytepunx
created: 2026-11-09T23:40:33Z
updated: 2026-11-09T23:40:33Z
transitions: []
stream: S-0025
tags: [kluster, scripts, integration]
touches: [scripts/lib-kluster.sh, scripts/kluster-build.sh, scripts/kluster-deploy.sh, scripts/kluster-signet.sh, scripts/kluster-signet-push.mjs, integration/scripts/lib-secrets.sh, integration/manifests/00-namespace.yaml, integration/manifests/admin-rbac.yaml, integration/manifests/10-tower.yaml, integration/manifests/11-keep.yaml, integration/manifests/11-keep-pricing-sync-cronjob.yaml, integration/manifests/12-herald.yaml, integration/manifests/12-herald-retention-purge-cronjob.yaml, integration/manifests/13-lookout.yaml, integration/manifests/14-chronicle.yaml, integration/manifests/15-steward.yaml, integration/manifests/16-web.yaml, integration/manifests/17-portcullis.yaml, integration/config/authstar/tower.yaml, integration/config/authstar/keep.yaml, integration/config/authstar/herald.yaml, integration/config/authstar/lookout.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/steward.yaml, integration/config/authstar/web.yaml, integration/config/authstar/portcullis.yaml]
---
# T-0128 A live deploy of S-0025 into s-0025 rolls out all eight services, and a second deploy passes

## Work

Waits for no task: it is the first live run of S-0019's deploy.

The agent runs no cluster command: `flai guard` refuses it `flai kluster up` and `deploy`, and the host's default kube context is a remote cluster (D-0026). So:

1. Ask the operator on a thread on S-0025 to run `flai kluster up`, if `flai kluster status` says the cluster is down, then `flai kluster deploy S-0025` at the story's head.
2. Read the job's log under `.flai-cache/kluster/logs` and its outcome with `flai kluster deployments`, which an agent may run.
3. Fix the step that failed at its cause: the signet push in `scripts/kluster-signet-push.mjs` or `scripts/kluster-signet.sh`, the RabbitMQ or database step in `scripts/kluster-deploy.sh` or `scripts/lib-kluster.sh`, the image build in `scripts/kluster-build.sh`, or a rollout in the manifest or service config it names. Commit, and ask for the deploy again.
4. Repeat until the job ends with the deploy's last line, `deployed <tag> into s-0025`, then ask for one more deploy at the same head, to prove the deploy updates a namespace in place.

Keep each fix in the scripts' dry run: `KLUSTER_DRY_RUN=1` still passes for `s-0025` and for `authstar`. Record each round, its job and the step it failed at, in this task's Notes.

## Done when

- A `flai kluster deploy S-0025` job at the story's head records success, and its log shows all eight rollouts complete in `s-0025`
- A second deploy at the same head records success too
- `shellcheck` and `sh -n` pass on every changed script, `node --check` on every changed `.mjs`, and `KLUSTER_DRY_RUN=1` runs of `scripts/kluster-deploy.sh` pass for `s-0025` and `authstar`
- This task's Notes list each deploy job, the step it failed at, and the fix

## Notes
