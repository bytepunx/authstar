---
id: I-0028
title: Golden path's herald send-and-verify fails intermittently with an RSA OAEP decoding error on a namespace's first checks run
class: defect
status: open
count: 1
cost: 5m
first_reported: 2026-11-14T10:49:06Z
last_reported: 2026-11-14T10:49:06Z
updated: 2026-11-14T10:49:06Z
---

# I-0028 Golden path's herald send-and-verify fails intermittently with an RSA OAEP decoding error on a namespace's first checks run

## Description
Golden path's herald send-and-verify fails intermittently with an RSA OAEP decoding error on a namespace's first checks run

## Instances

### 2026-11-14T10:49:06Z
Story: S-0015.
S-0015's first kluster checks run at e6edbe8 failed golden-path step 5: `herald send-and-verify -- unexpected outcome (communication.failed): payload decryption failed: error:02000079:rsa routines::oaep decoding error`, right after `herald operator key-rotation API` passed. A rerun at the same commit, with nothing changed, passed. The checks logs under ~/.flai/serve/checks show the same failure-then-pass for S-0013 (10:24 then 10:29) and S-0017 (09:17 then 09:23). It looks like the invite is encrypted with a key generation the send worker does not hold yet after the step's own rotation. S-0015 does not change herald's harness path: its bundle's towerBaseUrl is http://.

## Remediation
