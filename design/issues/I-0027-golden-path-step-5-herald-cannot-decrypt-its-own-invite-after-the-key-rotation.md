---
id: I-0027
title: "Golden path step 5: herald cannot decrypt its own invite after the key rotation (OAEP decoding error), intermittently"
class: defect
status: open
count: 1
cost: 30m
first_reported: 2026-11-14T10:26:37Z
last_reported: 2026-11-14T10:26:37Z
updated: 2026-11-14T17:29:38Z
---

# I-0027 Golden path step 5: herald cannot decrypt its own invite after the key rotation (OAEP decoding error), intermittently

## Description
Golden path step 5: herald cannot decrypt its own invite after the key rotation (OAEP decoding error), intermittently

## Instances

### 2026-11-14T10:26:37Z
Story: S-0013.
flai serve's checks of S-0013 at b980be4 in namespace s-0013 (log ~/.flai/serve/checks/S-0013-20261114T102440Z.log) failed only golden-path step 5: 'herald send-and-verify -- unexpected outcome (communication.failed): payload decryption failed: error:02000079:rsa routines::oaep decoding error'. Every other step passed (10 of 11). S-0013 changes only steward, its tests, and docs; herald, tower, and integration/scripts/scenario-golden-path.sh are as on main, and the branch has S-0017's fix bab5ba6, which narrowed step 5 to its own invite's outcome. So this invite was encrypted with a key herald no longer holds, which points to a race between herald's key rotation (the signet admin push in step 5) and the public key tower encrypts the invite with. It is intermittent: S-0017's checks hit it at 09:17Z and passed at 09:23Z, and S-0006's passed at 09:43Z with the same script. By the time I looked, the namespace's pods were about 2 minutes old (herald and tower had restarted once), so the logs from the failed run were gone.

## Remediation

Story S-0032 remediates this issue, created from it at 2026-11-14T17:29:38Z.
