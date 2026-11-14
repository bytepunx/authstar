---
id: T-0149
type: task
nature: remediation
title: Close I-0021 with the reason that keep no longer publishes or reads the tenant scope
status: backlog
parent: S-0026
owner: bytepunx
created: 2026-11-14T10:09:37Z
updated: 2026-11-14T10:09:37Z
transitions: []
stream: S-0026
tags: [keep, issues]
touches: [design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md, design/issues/summary.md]
after: [T-0147, T-0148]
---
# T-0149 Close I-0021 with the reason that keep no longer publishes or reads the tenant scope

## Work

This task waits for T-0147 and T-0148, because the issue can close only once both of its causes are fixed.

Search keep's `src` for `{tenant}` scopes once more. The only ones left should be `keep/src/report-tenant-scope.ts` and the 400 refusals that ADR-0109 requires. Then run `flai issue close I-0021 --reason` with a reason that names the ADR from T-0146, the per-account usage-updated scope, and the removed customer route. flai regenerates `design/issues/summary.md`.

## Done when

- I-0021 is closed, and its reason names what fixed it.
- `design/issues/summary.md` no longer lists I-0021 as open.
- Both of S-0026's criteria can be ticked.

## Notes
