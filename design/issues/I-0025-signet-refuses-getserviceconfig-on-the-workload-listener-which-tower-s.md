---
id: I-0025
title: Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials
class: defect
status: open
count: 1
cost: 30m
first_reported: 2026-11-13T22:23:24Z
last_reported: 2026-11-13T22:23:24Z
updated: 2026-11-13T22:23:24Z
---

# I-0025 Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials

## Description
Signet refuses GetServiceConfig on the workload listener, which tower's signetAdmin.getConfig dials

## Instances

### 2026-11-13T22:23:24Z
Story: S-0017.
Live on S-0017's kluster namespace s-0017 (deploy at c4b9e1e), tower's `signetAdmin.getConfig('portcullis')` failed with `7 PERMISSION_DENIED: /admin.v1.GitOpsService/GetServiceConfig is only reachable via the admin listener, not the workload listener`. Tower dials signet over the workload listener (`tower/src/lib/signet-admin.ts`, ADR 0103), whose comment expects GetServiceConfig to work there. PatchServiceConfig on the same listener is not refused. S-0017 stopped tenant registration from reading the config. `tower/src/routes/rotate-keys.ts` still calls getConfig to prune key generations past retention, so a live key rotation with pruning likely fails the same way. That is not verified live. Fix either signet's listener policy or tower's rotate-keys.

## Remediation
