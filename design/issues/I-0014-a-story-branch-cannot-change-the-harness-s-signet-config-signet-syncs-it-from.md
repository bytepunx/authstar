---
id: I-0014
title: "A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo"
class: blocker
status: open
count: 1
cost: 45m
first_reported: 2026-11-09T07:16:18Z
last_reported: 2026-11-09T07:16:18Z
updated: 2026-11-09T07:16:18Z
---

# I-0014 A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo

## Description
A story branch cannot change the harness's signet config: signet syncs it from bytepunx/authstar-integration's main, not the monorepo

## Instances

### 2026-11-09T07:16:18Z
Story: S-0006.
S-0006 ran the golden path on the running authstar-integration cluster, using keep, portcullis, and web images built from story/S-0006. Step 4b got 503 "billing unavailable" because integration/config/authstar/portcullis.yaml has no keepUpstream. T-0095 adds it on the branch, but signet reads config only from the repo registered by integration/scripts/provision.sh: git@github.com:bytepunx/authstar-integration.git, branch main. The old pre-monorepo repo is still unarchived (D-0001, D-0006), and `signet bundle push` carries secrets but not config. The only way to get the change into the cluster is to push it to an external repo's main. On the same cluster, tower and herald also refuse the golden path's operator token, and tower answers that tenant self-service provisioning is disabled. Its provisioned state does not match integration/scripts/lib-secrets.sh: the deployments run s-0901 images, from work this project does not record.

## Remediation
