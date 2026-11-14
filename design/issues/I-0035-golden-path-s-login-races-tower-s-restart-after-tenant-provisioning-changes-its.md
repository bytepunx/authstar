---
id: I-0035
title: Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500
class: defect
status: open
count: 1
cost: 20m
first_reported: 2026-11-14T18:03:10Z
last_reported: 2026-11-14T18:03:10Z
updated: 2026-11-14T18:03:10Z
---

# I-0035 Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500

## Description
Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500

## Instances

### 2026-11-14T18:03:10Z
Story: S-0021.
flai serve's checks of S-0021 at 7b19fc1 failed at golden-path step 2: "FAIL: login step 6 (portcullis callback, HTTP/1.1 500 Internal Server Error) -- no jwt cookie in response". S-0021 changes no service.

Tower's log in namespace s-0021 shows the sequence:
- It served step 1's `POST /tenants` (201) and `GET /tenants/acme` (200).
- About 10 seconds later it logged "signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart", and Kubernetes restarted it.
- At 18:02:17Z, while tower was down, portcullis logged `ERROR authstar_middleware::oauth::callback: identity resolution failed error=request to tower failed: error sending request for url (https://tower.s-0021.svc.cluster.local:8080/identities/resolve)`.

`integration/scripts/scenario-golden-path.sh` does not wait for tower to come back after step 1 before the login in step 2.

The same login step 6 failure is in S-0022's checks at 11:41Z and 11:51Z, and in S-0014's at 11:12Z (`~/.flai/serve/checks/`), and neither story changes portcullis or tower. A likely fix: after step 1, the golden path waits for tower's rollout or `/_ready` before step 2.

## Remediation
