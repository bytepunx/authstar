---
title: "Story 006: Permission Enforcement Middleware"
updated: 2026-08-14
status: draft
---
# Story 006 — Permission Enforcement Middleware

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — every prior herald story assumes this exists and none of them specify it.** Per
[ADR 0034](../../adrs/0034-herald-api-surface.md),
[ADR 0049](../../adrs/0049-web-admin-information-architecture.md),
[ADR 0051](../../adrs/0051-web-applications-and-identity-access-screens.md),
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md),
[ADR 0089](../../adrs/0089-internal-jwt-carries-its-own-tenant-hint.md).
**Depends on:** [tower Story 014](../tower/014-permission-enforcement-middleware.md) — same
mechanism, not re-derived here.

---

## The gap this closes

Herald's own route files (`communication-types.ts`, `suppressions.ts`, `sending-config.ts`)
each carry an explicit "no auth middleware in this slice" comment — the gap is already
self-documented in code, just never given a mechanism to close it. The RabbitMQ-consumed
sending path (herald's other half — `POST /_authstar/webhooks/ses` once
[Story 005](005-webhooks-config-rotation-and-activity.md) lands, and the ingest path itself) is
unaffected by this story: neither is reached via a tenant-admin's own permission-gated HTTP
call, so neither needs this mechanism.

## Mechanism

Identical to [tower Story 014](../tower/014-permission-enforcement-middleware.md)'s — same
`@bytepunx/authstar-fastify`-backed `preHandler`, same `enrichmentStatus: "degraded"` handling,
same generic-403 posture. No herald-specific exemption beyond the route table below.

## Route → permission mapping

| Route family | Grant | Story |
|---|---|---|
| Communication types/templates CRUD | `communication-types:manage` | [003](003-communication-types-and-templates.md) |
| Communication history read | `communications:read` | [004](004-communication-history-opt-outs-and-suppressions.md) |
| Opt-outs read/write | `opt-outs:manage` | [004](004-communication-history-opt-outs-and-suppressions.md) |
| Suppressions read/write (admin-facing) | `suppressions:manage` | [004](004-communication-history-opt-outs-and-suppressions.md), [ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md) |
| Sending config read/write | `sending-config:manage` | [005](005-webhooks-config-rotation-and-activity.md) (ADR 0049) |
| Operator key rotation, activity feed | operator bearer token, not a `permissions` grant | [005](005-webhooks-config-rotation-and-activity.md) — same mechanism as tower Story 013, not this story's concern |

The SES/SNS webhook is excluded — it's not a tenant-admin-authenticated call. `POST
/tenants/{tenantSlug}/suppressions` (`reason: "manual"` only per the current code) is **not**
excluded, despite an earlier draft of this table saying so — it's the admin/support-initiated
"please stop emailing me entirely" action (Story 004's own framing), gated by
`suppressions:manage` the same as the rest of that route family. `reason` is restricted to
`"manual"` precisely because `"hard-bounce"`/`"complaint"` are reserved for the SES/SNS webhook
path, not because this route itself is public.

## Not Covered Here

- The operator-scoped routes in Story 005 — bearer-token gated the same way tower's operator
  tree is, not this story's mechanism.

## Notes

- `@bytepunx/authstar-fastify` is published to npm (same resolution as tower Story 014's
  identical prerequisite).
- Separate from, and does not resolve, the real-signet-key-distribution gap for herald's
  payload-encryption public key (ADR 0025) — that's about publishers encrypting *to* herald,
  unrelated to admins authenticating *against* herald.
