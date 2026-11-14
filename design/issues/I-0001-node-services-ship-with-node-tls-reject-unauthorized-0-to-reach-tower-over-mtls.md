---
id: I-0001
title: "Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS"
class: defect
status: closed
count: 2
cost: 5m
first_reported: 2026-10-21T05:12:11Z
last_reported: 2026-11-06T18:09:49Z
updated: 2026-11-14T10:41:01Z
---

# I-0001 Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS

## Description
Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS

## Instances

### 2026-10-21T05:12:11Z
Story: S-0001.
chart/values.yaml sets NODE_TLS_REJECT_UNAUTHORIZED=0 in the extraEnv of tower, keep, steward, and web, disabling TLS verification process-wide instead of trusting the SPIRE CA. Found during the 2026-10-20 audit.

### 2026-11-06T18:09:49Z
Story: S-0009.
S-0009 gave chronicle the same workaround: chronicle now calls tower's GET /tenants/:slug over https to resolve tenant domains for JWKS, so chart/values.yaml and integration/manifests/14-chronicle.yaml set NODE_TLS_REJECT_UNAUTHORIZED=0 for chronicle too.

## Remediation

Story S-0015 remediates this issue, created from it at 2026-11-06T17:38:17Z.
Closed 2026-11-14T10:41:01Z: S-0015 (ADR-0113): chronicle, herald, keep, steward, and web each verify tower's SVID against the SPIRE trust bundle and trust domain from the Workload API, through their own `tower-tls.ts`, for tower's origin alone. `chart/values.yaml` and the harness manifests (`integration/manifests/11-keep.yaml`, `14-chronicle.yaml`) no longer set NODE_TLS_REJECT_UNAUTHORIZED. Each service's `tower-tls.spec.ts` runs real TLS handshakes against a tower-shaped SVID and shows plain fetch refuses it while the trust-bundle fetch accepts it, and refuses a wrong CA, trust domain, or non-SPIFFE cert.
