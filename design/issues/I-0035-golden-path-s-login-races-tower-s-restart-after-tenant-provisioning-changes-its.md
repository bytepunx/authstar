---
id: I-0035
title: Golden path's login races tower's restart after tenant provisioning changes its signet bundle, so portcullis's callback returns 500
class: defect
status: closed
count: 2
cost: 18m
first_reported: 2026-11-14T18:03:10Z
last_reported: 2026-11-14T18:10:42Z
updated: 2026-11-18T08:38:51Z
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

### 2026-11-14T18:10:42Z
Story: S-0021.
This is the same race S-0014 recorded as I-0030 on story/S-0014, with tower's 27-second restart window recorded there as I-0031. Neither issue was on main when I-0035 was opened. If S-0014 lands, merge the two.

S-0021's second deploy, at b98d7fb, failed login step 6 the same way at 18:06:00Z. Tower then crash-looped on `connect ECONNREFUSED 10.43.181.152:5432` to the cluster's shared Postgres (in `ensureContactsSchema`) until about 18:08Z.

A checks rerun with no redeploy, at 18:09:49Z, passed login, the account, keep, and me/subscription. It failed two steps:
- herald send-and-verify: `payload decryption failed: error:02000079:rsa routines::oaep decoding error`. Tower booted with its ephemeral herald key, as in S-0014's second run.
- chronicle auth-funnel report through portcullis: 403 `missing required permission: analytics:read`.

S-0021 changes none of these services.

## Remediation

Story S-0039 remediates this issue, created from it at 2026-11-18T07:34:03Z.
Closed 2026-11-18T08:38:51Z: S-0039: the golden path now waits for each signet-coordinated restart it sets off (integration/scripts/lib.sh's wait_for_signet_restart): after step 1's provisioning, for tower and portcullis, before the login; and after herald's key rotation, for herald and tower, before the invite, so tower encrypts it with the rotated key and step 6 starts once tower is back. Verified on s-0039 at 19867b9: the first checks run against fresh tenant state (provisioning 201) passed 11/11 after waiting 41s for tower's post-provisioning restart, and a rerun with no redeploy passed 11/11 (job S-0039-checks-20261118T083611Z). I-0030 on story/S-0014 is the same defect: close it as a duplicate of this issue when S-0014 lands.
