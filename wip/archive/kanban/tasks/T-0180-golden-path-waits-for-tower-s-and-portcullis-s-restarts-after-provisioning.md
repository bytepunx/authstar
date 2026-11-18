---
id: T-0180
type: task
nature: remediation
title: Golden path waits for tower's and portcullis's restarts after provisioning, before the login
status: done
parent: S-0039
owner: bytepunx
created: 2026-11-18T07:37:53Z
updated: 2026-11-18T07:45:28Z
transitions:
  - to: ready
    at: 2026-11-18T07:44:46Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:44:46Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T07:45:28Z
    by: agent-S-0039
stream: S-0039
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh]
after: [T-0178]
usage:
  source: log
  seconds: 42
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 7
      output: 1461
      cache_read: 726006
      cache_write: 8272
      cost: 0.2406
---
# T-0180 Golden path waits for tower's and portcullis's restarts after provisioning, before the login

## Work

This task waits for T-0178, because it calls the helper T-0178 adds to `integration/scripts/lib.sh`.

Step 1 of `integration/scripts/scenario-golden-path.sh` changes two bundles. `POST /tenants` and `PATCH /tenants/:slug/domain` push the tenant's keys and provider secret to portcullis's bundle, and its contact-hash pepper to tower's (`tower/src/routes/provisioning.ts`). Each workload then restarts under signet's restart lock. Step 2's login lands in tower's restart and the callback answers 500 (I-0035, first instance).

- Before step 1's first call, take the time and a `restart_mark` of tower and of portcullis.
- After step 1's checks, call `wait_for_signet_restart` for tower, then for portcullis, before step 2 begins.
- After the waits, check that the port-forwards to tower and portcullis still answer, and start a dead one again with `port_forward`. A container restarted in place keeps its pod, but `kubectl port-forward` may not survive the restart.
- Update the script's header comment to say that step 1 waits for the restarts it sets off.

On a rerun that finds the tenant provisioned, no bundle may change. The helper's settle window then lets step 2 go on.

## Done when

- Step 2 starts only once each restart step 1 set off has finished, or once the settle window shows none was set off.
- `bash -n integration/scripts/scenario-golden-path.sh` passes, and so does `shellcheck`, where the host has it.

## Notes
