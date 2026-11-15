---
id: I-0029
title: "Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window"
class: defect
status: open
count: 1
cost: 30m
first_reported: 2026-11-14T10:51:50Z
last_reported: 2026-11-14T10:51:50Z
updated: 2026-11-15T07:27:58Z
---

# I-0029 Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window

## Description
Services hang ~25s after taking signet's restart lock, so the golden path fails when a check lands in the window

## Instances

### 2026-11-14T10:51:50Z
Story: S-0016.
S-0016's first kluster checks, at 51aaf50 on a fresh namespace s-0016, failed golden-path step 4b. `/_authstar/me/subscription` returned 403 `{"error":"forbidden"}`: keep's `/me/subscription` refuses a token whose `enrichmentStatus` is not `ok`.

Tower's log shows the cause:
- 10:48:17Z: step 1's provisioning changed tower's signet bundle, and tower logged "signet bundle changed -- acquired restart lock, shutting down".
- Tower closed its port but did not exit for 25s, until the liveness probe killed it at 10:48:42Z. It listened again at 10:48:45Z.
- Step 4b, at 10:48:26Z, fell in that window. Portcullis's `/enrich` call to tower failed, and the forwarded token was degraded.

Herald, which S-0016 does not change, shows the same pattern. It took the restart lock at 10:48:37Z and was killed by its liveness probe about 26s later.

On tower, a SIGTERM alone shut tower down in about 1s. So the hang is in the restart-lock branch after `app.close()`, most likely in `await lock.release()` from `@bytepunx/signet-client`.

A second checks run at the same commit, against the steady namespace, passed. The golden path has no wait for services to settle after provisioning restarts them.

## Remediation

Story S-0038 remediates this issue, created from it at 2026-11-15T07:27:58Z.
