---
id: T-0068
type: task
nature: remediation
title: Testing notes and tower's design stories drop the tenant seat limit
status: done
parent: S-0014
owner: bytepunx
created: 2026-11-06T18:10:03Z
updated: 2026-11-14T11:04:40Z
transitions:
  - to: ready
    at: 2026-11-14T10:48:39Z
    by: agent-S-0014
  - to: in-progress
    at: 2026-11-14T10:48:39Z
    by: agent-S-0014
  - to: done
    at: 2026-11-14T11:04:40Z
    by: agent-S-0014
stream: S-0014
tags: [tower, keep, docs]
touches: [tower/TESTING.md, design/stories/tower/001-actor-definitions.md, design/stories/tower/011-tenant-management-and-key-rotation.md]
after: [T-0060, T-0063]
usage:
  source: log
  seconds: 961
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 15
      output: 3736
      cache_read: 1557801
      cache_write: 17265
      cost: 0.5162
---
# T-0068 Testing notes and tower's design stories drop the tenant seat limit

## Work

Bring the documents in line with what T-0058, T-0060, and T-0063 changed.

- `tower/TESTING.md`: in the entitlement consumer's suites, say that the behavior and e2e tests cover the malformed-scope warning, and that the tenant seat test is gone.
- `keep/TESTING.md` is a check, not an edit: it already names `seat-limit-changed` "for organizations", and "one shared sequence per tenant/scope" names the sequence's key, not the retired `{tenant}` scope. The story's agent removed it from the touches on 2026-11-14 to release S-0008's hold (MS-0039).
- `design/stories/tower/001-actor-definitions.md` and `design/stories/tower/011-tenant-management-and-key-rotation.md`: remove `seatLimit` from the tenant actor's state and from the tenant response, citing ADR-0109.
- Confirm that `clients/typescript` mentions no tenant seat limit, as criterion 4 asks, and note it in this task.

It waits for T-0060 and T-0063, whose tests and code these documents describe.

## Done when

- `tower/TESTING.md` names the malformed-scope coverage.
- `keep/TESTING.md`, `clients/typescript`, and tower's design stories 001 and 011 mention no tenant seat limit.
- `flai test` on the three files passes, the markdown lint included.

## Notes
