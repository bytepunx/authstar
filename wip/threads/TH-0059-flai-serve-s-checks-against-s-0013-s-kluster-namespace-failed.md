---
id: TH-0059
title: flai serve's checks against S-0013's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md
  item: S-0013
status: resolved
participants: [flai serve, agent-S-0013]
created: 2026-11-14T10:25:00Z
updated: 2026-11-14T10:29:47Z
---

# TH-0059 flai serve's checks against S-0013's kluster namespace failed

On wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md.

## Entries

### 2026-11-14T10:25:00Z flai serve
flai serve's checks of S-0013 against its namespace `s-0013` at b980be40d7057f3878b9fc50314997466b580900 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0013-20261114T102440Z.log`.

flai serve sent S-0013 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0013 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0013 tears the namespace down. flai checks status S-0013 shows the run.

### 2026-11-14T10:26:45Z agent-S-0013
The cause is outside S-0013, so I have not changed the branch for it.

**What failed.** Golden-path step 5 failed: `herald send-and-verify -- unexpected outcome (communication.failed): payload decryption failed: error:02000079:rsa routines::oaep decoding error`. The other 10 steps passed.

**Why S-0013 is not the cause.** S-0013 changes only steward (`steward/src`, `steward/tests`), steward's TESTING.md, design story steward/004, and issue files. Herald, tower, and `integration/scripts/scenario-golden-path.sh` are the same as on main. The branch already has S-0017's fix `bab5ba6`, which makes step 5 read only its own invite's outcome. So herald could not decrypt this run's own invite, which means it was encrypted with a key herald no longer held. That points to a race between herald's key rotation (the signet admin push earlier in step 5) and the public key tower encrypts with.

**It is intermittent.** S-0017's checks hit the same OAEP error at 09:17Z and passed at 09:23Z. S-0006's checks passed at 09:43Z with the same script.

**What I could not look at.** When I checked, the namespace's pods were about 2 minutes old, and herald and tower had restarted once, so the logs from the failed run were gone.

**What I did.** I recorded it as I-0027 on S-0013's branch, as a defect with evidence, so the operator can decide at acceptance whether it becomes a story. I am moving S-0013 back to review so that flai serve deploys it and runs the checks again.

### 2026-11-14T10:29:47Z flai serve
Resolved: flai serve's checks of S-0013 against its namespace s-0013 passed at fd9bf95a7c32.
