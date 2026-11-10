---
id: T-0109
type: task
nature: remediation
title: Chronicle trusts the harness CA for the JWKS host without new NODE_TLS_REJECT_UNAUTHORIZED
status: backlog
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:14Z
updated: 2026-11-09T20:56:14Z
transitions: []
stream: S-0017
tags: [integration, chronicle]
touches: [integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml]
after: [T-0107]
---
# T-0109 Chronicle trusts the harness CA for the JWKS host without new NODE_TLS_REJECT_UNAUTHORIZED

## Work

Criteria 1 and 3. Chronicle reaches tower at `towerBaseUrl` (`https://tower.authstar.svc.cluster.local:8080`) with `NODE_TLS_REJECT_UNAUTHORIZED=0` already set in `14-chronicle.yaml`, which I-0001 records and S-0015 removes. It has no CA for the JWKS host.

- In `integration/manifests/14-chronicle.yaml`, mount the CA ConfigMap T-0107 makes and set `NODE_EXTRA_CA_CERTS` to it, so the JWKS host is trusted on its own merits, not through the flag. Add no `NODE_TLS_REJECT_UNAUTHORIZED` anywhere else.
- In `integration/config/authstar/chronicle.yaml`, correct the comment at lines 20-28 so it says how chronicle reaches tower and the JWKS host. Change `towerBaseUrl` only if it is wrong.

It waits for T-0107, whose ConfigMap name and key it mounts.

## Done when

- `kubectl apply --dry-run=client` accepts `14-chronicle.yaml`, and `NODE_TLS_REJECT_UNAUTHORIZED` appears in `integration/` only where I-0001 records it.
- On a running harness, run by the operator (D-0026), a request from the chronicle pod to the JWKS URL succeeds with `NODE_TLS_REJECT_UNAUTHORIZED` unset for that request, which shows the CA alone makes the cert trusted.

## Notes
