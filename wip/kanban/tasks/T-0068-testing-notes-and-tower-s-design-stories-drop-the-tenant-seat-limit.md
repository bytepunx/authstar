---
id: T-0068
type: task
nature: remediation
title: Testing notes and tower's design stories drop the tenant seat limit
status: backlog
parent: S-0014
owner: bytepunx
created: 2026-11-06T18:10:03Z
updated: 2026-11-06T18:10:03Z
transitions: []
stream: S-0014
tags: [tower, keep, docs]
touches: [tower/TESTING.md, keep/TESTING.md, design/stories/tower/001-actor-definitions.md, design/stories/tower/011-tenant-management-and-key-rotation.md]
after: [T-0060, T-0063]
---
# T-0068 Testing notes and tower's design stories drop the tenant seat limit

## Work

Bring the documents in line with what T-0058, T-0060, and T-0063 changed.

- `tower/TESTING.md`: in the entitlement consumer's suites, say that the behavior and e2e tests cover the malformed-scope warning, and that the tenant seat test is gone.
- `keep/TESTING.md`: line 125 says "one shared sequence per tenant/scope". Reword it so it names the account and organization scopes ADR-0109 leaves, and make sure nothing else in the file mentions a tenant seat limit. Keep's own scope change is S-0005's: change only these words.
- `design/stories/tower/001-actor-definitions.md` and `design/stories/tower/011-tenant-management-and-key-rotation.md`: remove `seatLimit` from the tenant actor's state and from the tenant response, citing ADR-0109.
- Confirm that `clients/typescript` mentions no tenant seat limit, as criterion 4 asks, and note it in this task.

It waits for T-0060 and T-0063, whose tests and code these documents describe.

## Done when

- `tower/TESTING.md` names the malformed-scope coverage.
- `keep/TESTING.md`, `clients/typescript`, and tower's design stories 001 and 011 mention no tenant seat limit.
- `flai test` on the four files passes, the markdown lint included.

## Notes
