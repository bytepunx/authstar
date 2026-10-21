---
id: S-0013
type: story
nature: feature
title: Steward shows tenant activity and stuck erasure requests
status: backlog
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-10-21T05:13:43Z
transitions: []
tags: []
---
# S-0013 Steward shows tenant activity and stuck erasure requests

## Goal

Operators see what story steward/004 specifies: a tenant's cross-service activity feed and the erasure requests that have stalled, using the client methods steward already has.

## Acceptance criteria
- [ ] `/tenants/[slug]` gains an Activity section backed by `getActivity` and a Stuck Erasures section backed by `getStuckErasureRequests`
- [ ] Both sections have loading, empty, and error states consistent with the page's existing sections
- [ ] Behavior and e2e tests cover both against the fake tower

## Tasks

## Notes

`steward/src/lib/server/tower-client.ts` has `getActivity` and `getStuckErasureRequests` with no caller; tower's activity route per ADR-0060 must exist for the feed to show anything, which the task breakdown should verify first.
