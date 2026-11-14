---
id: T-0146
type: task
nature: remediation
title: An ADR scopes keep's usage-updated event to the reporting account and retires the tenant customer read
status: backlog
parent: S-0026
owner: bytepunx
created: 2026-11-14T10:09:07Z
updated: 2026-11-14T10:09:16Z
transitions: []
stream: S-0026
tags: [keep, adr]
touches: [design/adrs/0113-keep-s-usage-updated-event-is-scoped-to-the-reporting-account.md, design/adrs/README.md, design/stories/keep/001-actor-definitions.md, design/stories/keep/005-usage-records-and-credentials.md]
---
# T-0146 An ADR scopes keep's usage-updated event to the reporting account and retires the tenant customer read

## Work

I-0021 recommends no fix, so this task proposes one before any code changes. Write a new ADR that refines ADR-0043 and ADR-0109. Take the next free ADR number when you write it; 0113 in the touches is a guess, since ADR-0110 and ADR-0112 sit on open story branches.

The proposal is that `entitlement.usage-updated` carries `scope: {account: accountId}`. `periodUsage` is then the running total of the reporting account's usage records for that tenant, application, and meter. The tenant-wide sum goes away. This fits ADR-0043, because tower materialises the event into `account.usage`, which goes on that account's internal token. It also fits ADR-0109, which retires `{tenant}` from every `entitlement.*` event. Every usage record already carries a required `accountId`.

The same ADR retires `GET /tenants/{tenantSlug}/customer`, which ADR-0041 lists. No write path creates a `{tenant}` customer any more, and web, steward, and portcullis do not call the route. Say that `keep/src/report-tenant-scope.ts` stays as ADR-0109's one-off report.

Add the ADR's row to `design/adrs/README.md`. Update the `usageRecord` and `customer` shapes, and the usage-updated criterion, in `design/stories/keep/001-actor-definitions.md` and `design/stories/keep/005-usage-records-and-credentials.md`.

This task waits for nothing. It is the decision both code tasks build on.

## Done when

- The ADR is accepted. It states the event's scope, what `periodUsage` totals, and that the tenant customer route is removed. It names ADR-0043, ADR-0041, and ADR-0109.
- `design/adrs/README.md` lists the ADR.
- Design story keep/001 shows usage-updated scoped to `{account}`, and `customer` scoped to `{account}` or `{organization}`, with no `{tenant}`. Design story keep/005 says the same of usage-updated.
- `flai check --strict` and the markdown lint pass.

## Notes
