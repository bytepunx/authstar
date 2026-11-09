---
id: T-0088
type: task
nature: remediation
title: The integration manifests and tower's config stop the rollout drift S-0575 found
status: backlog
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:54:32Z
updated: 2026-11-09T06:54:32Z
transitions: []
stream: S-0019
tags: [kluster, integration]
touches: [integration/manifests/10-tower.yaml, integration/manifests/11-keep.yaml, integration/manifests/11-keep-pricing-sync-cronjob.yaml, integration/manifests/12-herald.yaml, integration/manifests/14-chronicle.yaml, integration/config/authstar/tower.yaml]
---
# T-0088 The integration manifests and tower's config stop the rollout drift S-0575 found

## Work

Fix the two faults in authstar that stopped every namespace in S-0575, each of which would stop a deploy's rollout or a service's first write:

- `SIGNET_ADMIN_ADDR` names signet's admin port `8444` in `10-tower.yaml`, `11-keep.yaml`, `11-keep-pricing-sync-cronjob.yaml`, `12-herald.yaml`, and `14-chronicle.yaml`. Since ADR-0103 the services write through workload mTLS, which signetd serves on `8443`. Change each to `8443`, after checking each service's signet client reads that variable for an mTLS write and not for an admin-token call.
- `integration/config/authstar/tower.yaml` gives `provisioning.defaultProvider.scope` as the string `openid email`; tower wants a list, and crash-loops without it. Write it `[openid, email]`.

Waits for no task: the deploy reads these files as they stand on the branch.

## Done when

- `grep -n 8444 integration/manifests/*.yaml` finds nothing, and tower's config parses with `scope` as a list in tower's own config schema test or a `node -e` check against its parser.
- `flai test` on the changed paths passes.

## Notes

S-0575's other drift is out of this story's scope, since none stops a rollout: Dex's redirect URI and password hash are kluster's (its `dex` addon), and the golden path's fixed database names and ports are the scenario's (S-0018 and S-0017 touch it).
