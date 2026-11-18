---
id: I-0040
title: A redeploy into a namespace with running services replaces their signet bundles, so they restart after the deploy passes and the first checks run lands in the restart
class: defect
status: open
count: 1
cost: 15m
first_reported: 2026-11-18T07:57:17Z
last_reported: 2026-11-18T07:57:17Z
updated: 2026-11-18T07:57:17Z
---

# I-0040 A redeploy into a namespace with running services replaces their signet bundles, so they restart after the deploy passes and the first checks run lands in the restart

## Description
A redeploy into a namespace with running services replaces their signet bundles, so they restart after the deploy passes and the first checks run lands in the restart

## Instances

### 2026-11-18T07:57:17Z
Story: S-0039.
S-0039's first deploy of s-0039 (job S-0039-deploy-20261118T074711Z) was interrupted at 07:49:28Z, after tower had started. The redeploy (S-0039-deploy-20261118T074940Z, at e26f2f1) seeded signet again; `scripts/kluster-signet.sh` replaces the bundles in place with fresh keys. The manifests were unchanged, so every `rollout status` passed at once and the deploy ended at about 07:53:58Z. The checks began then. Tower took signet's restart lock at 07:54:03Z and got SIGTERM at 07:54:27Z; herald, keep, and chronicle restarted at the same time. Step 1's `POST /tenants` at 07:54:04Z failed with curl exit 35 against tower's closed port, and the script exited with no FAIL line (I-0032's symptom). A fresh namespace does not hit this, since its pods start after the signet step. Likely fix: have `scripts/kluster-deploy.sh` mark each service before the signet step and wait for the restarts it sets off after the rollouts, as `integration/scripts/lib.sh`'s `wait_for_signet_restart` does for the golden path; or seed only the keys that are missing.

## Remediation
