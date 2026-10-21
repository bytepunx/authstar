---
id: I-0001
title: "Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS"
class: defect
status: open
count: 1
first_reported: 2026-10-21T05:12:11Z
last_reported: 2026-10-21T05:12:11Z
updated: 2026-10-21T05:12:11Z
---

# I-0001 Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS

## Description
Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS

## Instances

### 2026-10-21T05:12:11Z
Story: S-0001.
chart/values.yaml sets NODE_TLS_REJECT_UNAUTHORIZED=0 in the extraEnv of tower, keep, steward, and web, disabling TLS verification process-wide instead of trusting the SPIRE CA. Found during the 2026-10-20 audit.

## Remediation
