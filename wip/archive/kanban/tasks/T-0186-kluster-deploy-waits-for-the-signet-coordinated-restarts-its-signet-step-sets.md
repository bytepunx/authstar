---
id: T-0186
type: task
nature: remediation
title: Kluster deploy waits for the signet-coordinated restarts its signet step sets off (I-0040)
status: done
parent: S-0039
owner: alex
created: 2026-11-18T07:58:09Z
updated: 2026-11-18T07:59:24Z
transitions:
  - to: ready
    at: 2026-11-18T07:58:23Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:58:23Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T07:59:24Z
    by: agent-S-0039
stream: S-0039
tags: []
touches: [scripts/kluster-deploy.sh, integration/scripts/lib.sh, integration/README.md]
usage:
  source: log
  seconds: 61
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 10
      output: 2252
      cache_read: 1118828
      cache_write: 12748
      cost: 0.3708
---
# T-0186 Kluster deploy waits for the signet-coordinated restarts its signet step sets off (I-0040)

## Work

This task waits for none of the open tasks: T-0178, whose helper it calls, is done. T-0185 waits for it, because its runs need a deploy that leaves the namespace settled.

`scripts/kluster-signet.sh` replaces a namespace's signet bundles with fresh keys at every deploy. A redeploy over running services therefore restarts them under signet's restart lock after every `rollout status` has passed, and the first checks run lands in the restart (I-0040, seen on s-0039 at 07:54Z).

- In `integration/scripts/lib.sh`, let `restart_mark`, `pods_ready`, and `restart_lock_logged` run kubectl on `KLUSTER_KUBE_CONTEXT` when it is set, so the deploy can call them on its context.
- In `scripts/kluster-deploy.sh`, before the signet step, take the time and a `restart_mark` of each workload that restarts under signet's lock: tower, keep, herald, chronicle, portcullis. After the rollouts, call `wait_for_signet_restart` for each, through bash, with `KLUSTER_KUBE_CONTEXT` set to `FLAI_KLUSTER_CONTEXT`. A dry run skips the wait. On a fresh namespace the marks are empty, so each wait sees its new pod and returns once it is Ready.
- Say so in the deploy script's header and in `integration/README.md`'s section on story namespaces.

## Done when

- A redeploy ends only once each restart its signet step set off has finished, or once the settle window shows none began.
- `sh -n scripts/kluster-deploy.sh`, `bash -n integration/scripts/lib.sh`, and `shellcheck` on both pass.
- `KLUSTER_DRY_RUN=1` runs no wait.

## Notes
