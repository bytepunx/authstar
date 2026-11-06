---
id: T-0058
type: task
nature: remediation
title: Entitlement consumer logs scope-less events as malformed and drops the tenant seat branch
status: backlog
parent: S-0014
owner: bytepunx
created: 2026-11-06T18:09:36Z
updated: 2026-11-06T18:09:36Z
transitions: []
stream: S-0014
tags: [tower]
touches: [tower/src/lib/entitlement-consumer.ts, tower/src/server.ts, tower/spec/behavior/entitlement-consumer.spec.ts]
---
# T-0058 Entitlement consumer logs scope-less events as malformed and drops the tenant seat branch

## Work

Implement the consumer half of ADR-0109 in `tower/src/lib/entitlement-consumer.ts`. The ADR is on `story/S-0004` (commit a789f8b) until I-0004 is fixed.

- Add a logger to `EntitlementConsumerDeps`, with a `warn` method, and thread it through `handleEntitlementEvent` and `startEntitlementConsumer`. Pass one from `tower/src/server.ts` at the `startEntitlementConsumer` call. The Fastify `app.log` is not built yet there, so use a logger built before the consumer starts.
- `role-granted` and `role-revoked` with neither an account id nor an organization id now return silently. Make each log a warning naming the event type and the scope it carried, then ack as today.
- Remove the tenant branch of `seat-limit-changed`, including the fallback to `payload.tenant`. A `seat-limit-changed` with no organization id logs the same malformed warning.
- In `tower/spec/behavior/entitlement-consumer.spec.ts`: remove the "updates tenant seatLimit" test, drop the organization test's assertion on the tenant's `seatLimit`, and add tests with a spy logger. Cover a scope-less `role-granted`, a `{tenant}`-scoped `role-revoked`, and a `{tenant}`-scoped `seat-limit-changed`. Each test asserts one warning naming the event and scope, and no actor command.

It waits for no task. The tenant actor's command stays until the next layer removes it, so tower builds at every commit.

## Done when

- The consumer sends no `tenant.set-seat-limit` command and has no tenant branch.
- A role event or seat event with neither account nor organization id logs one warning naming the event type and scope.
- `flai test tower/src/lib/entitlement-consumer.ts` passes.

## Notes
