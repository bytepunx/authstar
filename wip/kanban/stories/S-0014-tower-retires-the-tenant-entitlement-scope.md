---
id: S-0014
type: story
nature: remediation
title: Tower retires the tenant entitlement scope
status: backlog
parent: E-0002
owner: alex
created: 2026-10-21T05:29:21Z
updated: 2026-10-21T05:29:21Z
transitions: []
tags: []
after: [S-0004]
---
# S-0014 Tower retires the tenant entitlement scope

## Goal

Tower implements ADR-0109: the tenant actor loses `seatLimit` and its command, the entitlement consumer logs a role event with neither account nor organization scope as malformed instead of dropping it silently, and the tenant branch of `seat-limit-changed` is gone.

## Acceptance criteria
- [ ] `tower/src/actors/tenant_actor.ts` has no `seatLimit`, `set-seat-limit`, or `seat-limit-set`, and no route or SDK type references them
- [ ] `tower/src/lib/entitlement-consumer.ts` logs a warning naming the event and scope for a role event with no account or organization id
- [ ] Behavior and e2e tests pass and cover the malformed-scope log
- [ ] `clients/typescript` types and `keep/TESTING.md` no longer mention tenant seat limits

## Tasks

## Notes

Breaking for any caller of `tenant.seatLimit`; the 2026-10-20 audit found none outside tower's tests. Ordered after S-0005 in practice, because keep must stop publishing tenant-scoped events first.
