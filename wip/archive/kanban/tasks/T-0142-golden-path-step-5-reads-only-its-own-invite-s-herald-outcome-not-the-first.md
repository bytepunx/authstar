---
id: T-0142
type: task
nature: remediation
title: Golden path step 5 reads only its own invite's herald outcome, not the first-admin invite's retries
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-14T09:21:11Z
updated: 2026-11-14T09:21:22Z
transitions:
  - to: ready
    at: 2026-11-14T09:21:17Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T09:21:17Z
    by: agent-S-0017
  - to: done
    at: 2026-11-14T09:21:22Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [integration/scripts/scenario-golden-path.sh]
usage:
  source: log
  seconds: 5
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 7
      output: 2135
      cache_read: 1096470
      cache_write: 18517
      cost: 0.3847
---
# T-0142 Golden path step 5 reads only its own invite's herald outcome, not the first-admin invite's retries

## Work

flai serve's checks run of s-0017 at 8b27d11 passed steps 1, 2, 3, 4, and 6, the report read through portcullis included. Step 5 failed with `communication.failed: payload decryption failed: error:02000079:rsa routines::oaep decoding error`.

Since S-0017, step 1 sets acme's domain, so tower issues the first-admin invite then. Tower encrypts it for herald before step 5 rotates herald's key, so herald cannot decrypt it, and its retries fail after step 5's `before_ts`. Step 5 read the newest outcome of any communication, which was that retry.

- `integration/scripts/scenario-golden-path.sh`: step 5 takes its invite's token from tower's 201. It reads only the outcomes of the communication whose `communication.created` event names `invite:<token>:sent`, matched on consequent's `system_id`.

## Done when

- `bash -n` and `shellcheck` pass, and a trial merge with S-0006's script is clean.
- flai serve's checks run passes on s-0017.

## Notes
