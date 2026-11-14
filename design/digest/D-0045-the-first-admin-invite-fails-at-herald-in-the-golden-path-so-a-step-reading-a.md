---
id: D-0045
title: The first-admin invite fails at herald in the golden path, so a step reading a herald outcome matches its own invite's communication, not the newest
kind: decision
sources: [S-0017, T-0142]
topics: [integration, herald, tower, shell, all]
paths: [integration/scripts/scenario-golden-path.sh, integration/README.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0045 The first-admin invite fails at herald in the golden path, so a step reading a herald outcome matches its own invite's communication, not the newest

Since S-0017, golden-path step 1 sets `acme`'s domain, so tower issues the first-admin invite there (ADR 0092). Tower encrypts that invite's payload for herald before step 5 rotates herald's key. Herald then cannot decrypt it, and its retries keep failing after step 5's `before_ts`.

flai serve's checks run of S-0017 at 8b27d11 failed step 5 on exactly that: "Step 5 failed with `communication.failed: payload decryption failed: error:02000079:rsa routines::oaep decoding error`." Step 5 had read "the newest outcome of any communication, which was that retry" (T-0142).

The fix, T-0142: step 5 takes its own invite's token from tower's 201 and "reads only the outcomes of the communication whose `communication.created` event names `invite:<token>:sent`, matched on consequent's `system_id`". A golden-path step that checks a herald outcome should match its own communication the same way: the first-admin invite's failures are expected noise there.

Source: S-0017, T-0142.
