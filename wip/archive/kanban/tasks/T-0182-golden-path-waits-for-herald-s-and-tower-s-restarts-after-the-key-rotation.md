---
id: T-0182
type: task
nature: remediation
title: Golden path waits for herald's and tower's restarts after the key rotation, before the invite
status: done
parent: S-0039
owner: bytepunx
created: 2026-11-18T07:38:00Z
updated: 2026-11-18T07:45:53Z
transitions:
  - to: ready
    at: 2026-11-18T07:45:34Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:45:34Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T07:45:53Z
    by: agent-S-0039
stream: S-0039
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh]
after: [T-0180]
usage:
  source: log
  seconds: 19
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 2
      output: 396
      cache_read: 196779
      cache_write: 2242
      cost: 0.0652
---
# T-0182 Golden path waits for herald's and tower's restarts after the key rotation, before the invite

## Work

This task waits for T-0180, because both change `integration/scripts/scenario-golden-path.sh`, and it reuses the port-forward check T-0180 writes.

Step 5's `POST /operator/rotate-keys` pushes herald's new key generations to herald's own bundle, and herald's payload public key to tower's (`herald/src/routes/operator-rotate-keys.ts`). Both workloads then restart. Today the script creates the invite at once, so tower can encrypt it with the key it booted with, the ephemeral one when no rotation reached signet before (`oaep decoding error`, I-0030's second instance). Step 6's report then lands in tower's restart, and chronicle answers 401 (I-0030's third instance).

- Before the rotation, take the time and a `restart_mark` of herald and of tower.
- When the rotation answers 200, call `wait_for_signet_restart` for herald, then for tower, before the invite is created. Tower then encrypts with the rotated key, and step 6 starts after tower is back.
- After the waits, check that the port-forwards to herald and tower still answer, and start a dead one again.
- Update the script's header comment to say that step 5 waits for the restarts it sets off.

## Done when

- The invite in step 5 is created only once each restart the rotation set off has finished.
- `bash -n integration/scripts/scenario-golden-path.sh` passes, and so does `shellcheck`, where the host has it.

## Notes
