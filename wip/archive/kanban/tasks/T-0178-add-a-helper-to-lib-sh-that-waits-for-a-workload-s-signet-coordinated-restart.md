---
id: T-0178
type: task
nature: remediation
title: Add a helper to lib.sh that waits for a workload's signet-coordinated restart
status: done
parent: S-0039
owner: bytepunx
created: 2026-11-18T07:37:44Z
updated: 2026-11-18T07:44:18Z
transitions:
  - to: ready
    at: 2026-11-18T07:43:09Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:43:09Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T07:44:18Z
    by: agent-S-0039
stream: S-0039
tags: [integration]
touches: [integration/scripts/lib.sh]
usage:
  source: log
  seconds: 69
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 7
      output: 1557
      cache_read: 773447
      cache_write: 8813
      cost: 0.2564
---
# T-0178 Add a helper to lib.sh that waits for a workload's signet-coordinated restart

## Work

This task waits for none: it adds the helper the scenario's two waits call.

Before building it, write the fix this story proposes in the narrative's `## Decisions`, as the Goal asks: the golden path marks each workload whose signet bundle a step changes, and waits for that workload's restart to finish before the next step.

Add two functions to `integration/scripts/lib.sh`, beside `log` and `die`:

- `restart_mark <namespace> <deploy>` prints a marker of the deployment's pod: its name and its container's `restartCount`, read with `kubectl get pod -l app=<deploy>`. The manifests label each pod `app: <deploy>` (`integration/manifests/10-tower.yaml`).
- `wait_for_signet_restart <namespace> <deploy> <marker> <since>` waits for the restart a step set off:
  1. For a settle window, 45 seconds by default, it watches for the restart to begin: the marker changes, or the workload's log since `<since>` holds its restart-lock line. The Node services log `signet bundle changed -- acquired restart lock` (`tower/src/server.ts`); portcullis logs `bundle changed and restart lock acquired` (`portcullis/crates/authstar-proxy/src/main.rs`). `waitForRestart` polls every 10 seconds, and the restart lock is fleet-wide with a 30-second TTL, so a second workload's restart can begin only after the first releases the lock. The window covers both.
  2. Once the restart has begun, it waits until the marker has changed and the pod is Ready, within a timeout, 120 seconds by default. That covers tower's 27-second hang (I-0031, which S-0038 fixes). On a timeout it dies, naming the deployment and its last marker.
  3. When no restart begins within the window, it logs that none was set off and returns 0, so that a rerun whose step changes no bundle goes on.

Let each window be overridden by an environment variable, and log each wait's outcome and how long it took, so that a run's log shows every restart it waited for.

## Done when

- `integration/scripts/lib.sh` has both functions, as above.
- `bash -n integration/scripts/lib.sh` passes, and so does `shellcheck`, where the host has it.
- The narrative's `## Decisions` holds the proposed fix.

## Notes
