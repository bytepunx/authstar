---
id: D-0050
title: "Golden-path step 5's OAEP decoding error on its own invite is herald's key-rotation race (I-0027), outside the story: record an instance and rerun the checks rather than change the branch"
kind: cause
sources: [TH-0059, S-0013, I-0027, S-0015, I-0028]
topics: [integration, herald, tower, kluster, testing]
paths: [integration/scripts/scenario-golden-path.sh, design/issues/I-0027-golden-path-step-5-herald-cannot-decrypt-its-own-invite-after-the-key-rotation.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0050 Golden-path step 5's OAEP decoding error on its own invite is herald's key-rotation race (I-0027), outside the story: record an instance and rerun the checks rather than change the branch

flai serve's checks of S-0013 at b980be4 failed only golden-path step 5, with "herald send-and-verify -- unexpected outcome (communication.failed): payload decryption failed: error:02000079:rsa routines::oaep decoding error" (TH-0059). The other 10 steps passed.

This is not the failure D-0045 describes. S-0013's branch already had S-0017's fix `bab5ba6`, which makes step 5 read only its own invite's outcome. So herald could not decrypt the run's own invite: tower encrypted it with a key herald no longer held. S-0013's agent put it down to "a race between herald's key rotation (the signet admin push earlier in step 5) and the public key tower encrypts with."

It is intermittent. S-0017's checks hit the same error at 09:17Z and passed at 09:23Z, and S-0006's passed at 09:43Z with the same script. S-0013 changed only steward, so its agent did not change the branch. It recorded the failure as I-0027, moved the story back to review, and flai serve's redeploy and checks passed at fd9bf95.

S-0015 hit it again on its first checks run and passed on a rerun at the same commit. Its narrative's Decisions: "Recorded I-0028: golden path's herald send-and-verify failed with an RSA OAEP error on S-0015's first checks run and passed on rerun at the same commit, as S-0013's and S-0017's did. It is not S-0015's change." It then closed I-0028 "as a duplicate of I-0027 (S-0013 recorded it first, and S-0032 remediates it); S-0015's occurrence moved to I-0027."

A story that does not touch herald, tower, or the golden-path script and hits this error should do the same: add an instance to I-0027 with `flai issue bump`, not a new issue, and rerun the checks. Herald and tower restart after the failed run, so their logs from it are gone within minutes. S-0032 remediates I-0027.

Source: TH-0059, S-0013, I-0027, S-0015, I-0028.
