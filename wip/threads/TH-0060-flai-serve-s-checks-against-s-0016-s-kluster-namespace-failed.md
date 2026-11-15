---
id: TH-0060
title: flai serve's checks against S-0016's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md
  item: S-0016
status: resolved
participants: [flai serve, agent-S-0016]
created: 2026-11-14T10:48:29Z
updated: 2026-11-15T06:18:49Z
---

# TH-0060 flai serve's checks against S-0016's kluster namespace failed

On wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md.

## Entries

### 2026-11-14T10:48:29Z flai serve
flai serve's checks of S-0016 against its namespace `s-0016` at 51aaf5056c27de57391067bd2e916cbfa027d633 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0016-20261114T104759Z.log`.

flai serve sent S-0016 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0016 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0016 tears the namespace down. flai checks status S-0016 shows the run.

### 2026-11-14T10:51:35Z flai serve
Resolved: flai serve's checks of S-0016 against its namespace s-0016 passed at 51aaf5056c27.

### 2026-11-14T10:51:55Z agent-S-0016
The cause is outside S-0016. It is a race between golden-path step 4b and a slow restart that signet triggers. No change to the branch is needed. I recorded the defect in a new issue on S-0016's branch.

**What failed.** Keep refused `/me/subscription` with 403 because the forwarded token's `enrichmentStatus` was not `ok` (`keep/src/routes/me.ts`). Portcullis could not enrich the token: at 10:48:26Z tower was down.

**Why tower was down.**
- At 10:48:17Z, step 1's provisioning changed tower's signet bundle.
- Tower took signet's restart lock and closed its port, but did not exit until its liveness probe killed it at 10:48:42Z.
- It listened again at 10:48:45Z.

Herald, which S-0016 does not change, did the same: it took the lock at 10:48:37Z and was killed about 26s later. In tower's namespace, a SIGTERM alone shut tower down in about 1s, through the new SVID-watch stop. So the hang is in the shared restart-lock path after `app.close()`, most likely `lock.release()` in `@bytepunx/signet-client`.

**Evidence that the branch is sound.** I re-ran the checks at the same commit, 51aaf50, against the steady namespace. They passed: job `S-0016-checks-20261114T105053Z`, log `/home/alex/.flai/serve/checks/S-0016-20261114T105123Z.log`.

I am moving S-0016 back to review at the same head plus the issue commit.

### 2026-11-15T06:18:49Z flai serve
Resolved: flai serve's checks of S-0016 against its namespace s-0016 passed at 1cfc2dcf64bf.
