# Story 006 — Permission Enforcement Middleware

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — every prior herald story assumes this exists and none of them specify it.** Per
[ADR 0034](../../decisions/0034-herald-api-surface.md),
[ADR 0049](../../decisions/0049-web-admin-information-architecture.md),
[ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0074](../../decisions/0074-herald-bounce-complaint-and-suppression.md),
[ADR 0089](../../decisions/0089-internal-jwt-carries-its-own-tenant-hint.md).
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
| Suppressions read/write (admin-facing) | `suppressions:manage` | [004](004-communication-history-opt-outs-and-suppressions.md), [ADR 0074](../../decisions/0074-herald-bounce-complaint-and-suppression.md) |
| Sending config read/write | `sending-config:manage` | [005](005-webhooks-config-rotation-and-activity.md) (ADR 0049) |
| Operator key rotation, activity feed | operator bearer token, not a `permissions` grant | [005](005-webhooks-config-rotation-and-activity.md) — same mechanism as tower Story 013, not this story's concern |

The public suppression-create endpoint (`reason: "manual"` only per the current code) and the
SES/SNS webhook are both excluded — neither is a tenant-admin-authenticated call.

## Not Covered Here

- The operator-scoped routes in Story 005 — bearer-token gated the same way tower's operator
  tree is, not this story's mechanism.

## Notes

- Same `@bytepunx/authstar-fastify` not-yet-published prerequisite as tower Story 014.
- Separate from, and does not resolve, the real-signet-key-distribution gap for herald's
  payload-encryption public key (ADR 0025) — that's about publishers encrypting *to* herald,
  unrelated to admins authenticating *against* herald.
