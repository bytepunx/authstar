---
id: T-0184
type: task
nature: remediation
title: Close I-0029 with what fixed it, naming I-0031 as the same defect
status: done
parent: S-0038
owner: bytepunx
created: 2026-11-18T07:38:07Z
updated: 2026-11-18T08:51:41Z
transitions:
  - to: ready
    at: 2026-11-18T08:51:33Z
    by: agent-S-0038
  - to: in-progress
    at: 2026-11-18T08:51:33Z
    by: agent-S-0038
  - to: done
    at: 2026-11-18T08:51:41Z
    by: agent-S-0038
stream: S-0038
tags: [tower]
touches: [design/issues/I-0029-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md, design/issues/summary.md]
after: [T-0181]
usage:
  source: log
  seconds: 8
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 3
      output: 583
      cache_read: 294205
      cache_write: 3624
      cost: 0.0983
---
# T-0184 Close I-0029 with what fixed it, naming I-0031 as the same defect

## Work

This task waits for T-0181, because its reason names the step T-0174 found and the exit times T-0181 measured live.

Run `flai issue close I-0029 --reason "<reason>"`. The reason names the step that hung, how each service's restart module now bounds it, and the restart module's path in tower, herald, keep, and chronicle. It gives the lock-to-exit seconds T-0181 measured on s-0038, and says that I-0031 on `story/S-0014` is the same defect. flai rewrites the issue and `design/issues/summary.md`; edit neither by hand.

If S-0014 has been accepted by then, I-0031 is on main: close it with the same reason, naming I-0029, and add its path to this task's touches.

## Done when

- I-0029's status is closed, with the reason above.
- I-0031 is closed the same way, if it is on main.
- `flai check --strict` passes.

## Notes
