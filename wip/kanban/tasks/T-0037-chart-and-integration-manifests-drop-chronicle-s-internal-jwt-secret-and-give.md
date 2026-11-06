---
id: T-0037
type: task
nature: remediation
title: Chart and integration manifests drop chronicle's internal JWT secret and give it towerBaseUrl
status: backlog
parent: S-0009
owner: bytepunx
created: 2026-11-06T17:51:01Z
updated: 2026-11-06T17:51:01Z
transitions: []
stream: S-0009
tags: [chronicle, chart, integration]
touches: [chart/values.yaml, chart/templates/chronicle/deployment.yaml, chart/README.md, integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml, integration/secrets/authstar/chronicle/internalJwtSecret.yaml, integration/scripts/lib-secrets.sh]
after: [T-0034]
---
# T-0037 Chart and integration manifests drop chronicle's internal JWT secret and give it towerBaseUrl

## Work

Make the chart and the integration harness match the configuration T-0034 leaves chronicle with:

- In `chart/values.yaml`, remove the `CHRONICLE_INTERNAL_JWT_SECRET` env entry (the `chronicle-secrets` / `INTERNAL_JWT_SECRET` `secretKeyRef`). Add chronicle's tower URL env, matching herald's and keep's in-cluster URL.
- Remove `internalJwtSecret` from the header comment in `chart/templates/chronicle/deployment.yaml`. Update the chronicle mention in `chart/README.md`.
- Add `towerBaseUrl: http://tower.authstar.svc.cluster.local:8080` to `integration/config/authstar/chronicle.yaml`, as `herald.yaml` and `keep.yaml` carry it. Drop the `internalJwtSecret` comment.
- Delete `integration/secrets/authstar/chronicle/internalJwtSecret.yaml`. Remove the `chronicle/internalJwtSecret` entry and its `SECRET_VALUE__` line from `integration/scripts/lib-secrets.sh`.
- Clean up the header comment in `integration/manifests/14-chronicle.yaml`. Add a tower URL env there only if env-only mode needs it.

## Done when

- `grep -rn "internalJwtSecret\|INTERNAL_JWT_SECRET\|dev-only-insecure-secret" chart integration/manifests integration/config integration/secrets integration/scripts/lib-secrets.sh` finds nothing about chronicle.
- `helm lint chart` and `helm template chart` pass, and the chronicle deployment they render carries the tower URL and no JWT secret.

## Notes

Check whether tower's in-cluster scheme is `http` or `https` for chronicle's caller. `portcullis.yaml` records that tower serves SPIFFE mTLS only, and herald's `towerBaseUrl` shows what a Node service uses today. Match herald.
