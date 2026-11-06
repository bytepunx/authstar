---
id: I-0001
title: "Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS"
class: defect
status: open
count: 2
cost: 5m
first_reported: 2026-10-21T05:12:11Z
last_reported: 2026-11-06T18:09:49Z
updated: 2026-11-06T18:09:49Z
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
