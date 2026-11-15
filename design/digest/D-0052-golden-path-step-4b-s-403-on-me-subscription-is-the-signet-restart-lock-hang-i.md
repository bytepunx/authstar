---
id: D-0052
title: "Golden-path step 4b's 403 on /me/subscription is the signet restart-lock hang (I-0029), outside the story: record an instance and rerun the checks rather than change the branch"
kind: cause
sources: [S-0016, TH-0060, I-0029]
topics: [integration, kluster, testing, signet, tower, herald, keep]
paths: [integration/scripts/scenario-golden-path.sh, keep/src/routes/me.ts, design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0052 Golden-path step 4b's 403 on /me/subscription is the signet restart-lock hang (I-0029), outside the story: record an instance and rerun the checks rather than change the branch

flai serve's first checks of S-0016 at 51aaf50, on a fresh namespace `s-0016`, failed golden-path step 4b: `/_authstar/me/subscription` answered 403 `{"error":"forbidden"}` (TH-0060). Keep's `/me/subscription` refuses a token whose `enrichmentStatus` is not `ok` (`keep/src/routes/me.ts`), and portcullis could not enrich it because tower was down.

S-0016's agent traced it on TH-0060: "At 10:48:17Z, step 1's provisioning changed tower's signet bundle. Tower took signet's restart lock and closed its port, but did not exit until its liveness probe killed it at 10:48:42Z." Step 4b ran at 10:48:26Z, inside that window. Herald, which S-0016 does not change, hung the same way about 26s after taking the lock. A SIGTERM alone shut tower down in about 1s, so the hang is in the shared restart-lock path after `app.close()`, most likely `lock.release()` in `@bytepunx/signet-client`. The golden path has no wait for services to settle after provisioning restarts them.

A second checks run at the same commit, against the steady namespace, passed, and S-0016's narrative records under Decisions: "Changed no code for TH-0060 ... The hang is recorded as I-0029."

A story that does not change the restart-lock path or the golden-path script and hits a degraded-token 403 right after provisioning should do the same: add an instance to I-0029 with `flai issue bump`, and rerun the checks. This is a different race from D-0050's step-5 OAEP error (I-0027).

Source: S-0016, TH-0060, I-0029.
