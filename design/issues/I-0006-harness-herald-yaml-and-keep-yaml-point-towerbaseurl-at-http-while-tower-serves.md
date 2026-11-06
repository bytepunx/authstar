---
id: I-0006
title: "Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https"
class: defect
status: open
count: 1
cost: 15m
first_reported: 2026-11-06T18:09:52Z
last_reported: 2026-11-06T18:09:52Z
updated: 2026-11-06T18:09:52Z
---

# I-0006 Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https

## Description
Harness herald.yaml and keep.yaml point towerBaseUrl at http:// while tower serves only https

## Instances

### 2026-11-06T18:09:52Z
Story: S-0009.
S-0009 copied herald's harness towerBaseUrl (http://tower.authstar.svc.cluster.local:8080) into chronicle.yaml, then found tower always runs an https listener (tower/src/lib/build-app.ts `https` option, integration/config/authstar/portcullis.yaml towerUpstream comment). Chronicle was corrected to https with NODE_TLS_REJECT_UNAUTHORIZED=0; integration/config/authstar/herald.yaml and keep.yaml still say http://, so herald's per-tenant JWKS resolution and keep's role-reference backfill cannot reach tower in the harness.

## Remediation
