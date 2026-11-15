---
id: D-0052
title: "Golden-path step 4b's 403 on /me/subscription is the signet restart-lock hang (I-0029), outside the story: record an instance and rerun the checks rather than change the branch"
kind: cause
sources: [S-0016, TH-0060, I-0029, S-0018, TH-0070, I-0038]
topics: [integration, kluster, testing, signet, tower, herald, keep]
paths: [integration/scripts/scenario-golden-path.sh, keep/src/routes/me.ts, design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md, design/issues/I-0038-golden-path-step-4b-keep-answers-403-on-authstar-me-subscription-through.md]
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

S-0018 met the same symptom on its first checks run, at 3babcf4 on namespace `s-0018` (TH-0070). Its agent wrote there: "tower had restarted 18s earlier and herald was not ready. That points to a startup race in the internal-JWT path (portcullis → keep)." It reran the checks at the same commit, every step passed, and it changed no code. It recorded the failure as a new issue, I-0038, rather than as an instance of I-0029; S-0033 remediates I-0038. Keep's 403 logs no reason, so neither run shows which check refused.

A story that does not change the restart-lock path, the internal-JWT path, or the golden-path script and hits a degraded-token 403 at step 4b on a fresh namespace should do the same: record an instance with `flai issue bump`, on I-0029 when tower's log shows it held the restart lock in the window, on I-0038 otherwise, and rerun the checks. This is a different race from D-0050's step-5 OAEP error (I-0027).

Source: S-0016, TH-0060, I-0029, S-0018, TH-0070, I-0038.
