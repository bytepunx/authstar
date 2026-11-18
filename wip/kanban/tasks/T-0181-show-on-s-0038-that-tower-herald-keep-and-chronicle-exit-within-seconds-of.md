---
id: T-0181
type: task
nature: remediation
title: Show on s-0038 that tower, herald, keep, and chronicle exit within seconds of taking the restart lock
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:37:59Z
updated: 2026-11-18T08:51:29Z
transitions:
  - to: ready
    at: 2026-11-18T07:51:31Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T07:51:31Z
    by: agent-S-0038
  - to: ready
    at: 2026-11-18T07:53:38Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T08:45:36Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T08:51:29Z
    by: agent-S-0038
stream: S-0038
tags: [tower, herald, keep, chronicle]
after: [T-0176, T-0177, T-0179]
usage:
  source: log
  seconds: 480
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 87
      output: 16826
      cache_read: 8491362
      cache_write: 104609
      cost: 2.8368
---
# T-0181 Show on s-0038 that tower, herald, keep, and chronicle exit within seconds of taking the restart lock

## Work

This task waits for T-0176, T-0177, and T-0179, and through them for T-0175, because it checks all four services' fixes on one live deploy.

1. Deploy the story's branch to `s-0038` with `flai kluster deploy S-0038 --job`, then run its checks with `flai checks run S-0038 --job`. The golden path's tenant provisioning and herald's key rotation change the services' bundles.
2. For each of tower, herald, keep, and chronicle, read the pod logs in the namespace. Find each "acquired restart lock" line and the step lines after it. Read the namespace's events too, for example with `flai kluster exec S-0038 -- kubectl get events`.
3. Write down, per service, the seconds from taking the lock to the exit, and whether any liveness probe killed a pod or a SIGTERM ended a restart.

A golden-path failure in this run that the logs show is not a service down after its restart lock, such as I-0035's login race before S-0039 lands, does not fail this task. Record it with `flai issue bump`, as D-0052 says.

## Done when

- The narrative's `## Decisions` gives, per service, the seconds from the lock to the exit, from the s-0038 logs, each under 10 seconds.
- No pod in the run was killed by its liveness probe after taking the restart lock.

## Notes
