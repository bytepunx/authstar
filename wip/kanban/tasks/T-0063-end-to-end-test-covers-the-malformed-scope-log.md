---
id: T-0063
type: task
nature: remediation
title: End-to-end test covers the malformed-scope log
status: backlog
parent: S-0014
owner: bytepunx
created: 2026-11-06T18:09:51Z
updated: 2026-11-06T18:09:58Z
transitions: []
stream: S-0014
tags: [tower, testing]
touches: [tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts]
after: [T-0058]
---
# T-0063 End-to-end test covers the malformed-scope log

## Work

In `tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts`, pass a spy logger to `startEntitlementConsumer`, which takes one after T-0058. After the account-scoped `role-granted` the test already sends, simulate a `role-granted` with a `{tenant}` scope on the same fake channel. Assert:

- one warning naming the event type and the scope;
- the message is acked, not nacked;
- the account's enrichment over HTTP is what the account-scoped grant left, with nothing granted by the tenant-scoped event.

It waits for T-0058, whose logger dependency this test injects. It shares no file with T-0060, so the two run together.

## Done when

- The e2e sends a tenant-scoped role event and asserts the malformed-scope warning and the unchanged enrichment.
- `flai test tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts` passes.

## Notes
