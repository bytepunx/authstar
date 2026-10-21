---
id: ADR-0082
title: Tower Actor Boundary Corrections — `provider`, `inviteCode`, `invite`
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0082: Tower Actor Boundary Corrections — `provider`, `inviteCode`, `invite`

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** tower
- **Corrects:** [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md)

## Context

Consolidating tower's full actor model in one place (in preparation for writing tower's
Stories, grounded against `consequent`'s actual actor-module shape) surfaced three real
modeling gaps that had accumulated silently across many ADRs, each individually reasonable at
the time but never reconciled against each other:

1. **`provider` was never declared as its own `consequent` actor.** ADR 0020 introduced it as a
   plain, nested map inside `tenant.providers` — non-secret metadata only. But ADR 0053 gave it
   a `status` field with real transitions, and [ADR 0073](0073-provider-discovery-status-feedback.md)
   gave it `discoveryStatus`, materialized from its own `provider.discovery-unavailable`/
   `provider.discovery-recovered` **events**. A nested map field can't have its own event
   history — `consequent`'s whole model is built around actors as the unit of event-sourcing.
   Later ADRs kept treating `provider` as if it already were an independent actor without ever
   actually declaring it one.
2. **`inviteCode.identifiedBy` is the bare `code` field — not tenant-scoped.** ADR 0019
   deliberately wanted human-chosen, memorable codes (`LAUNCH50`, `SPEAKERJOHN`) and stated
   "uniqueness is enforced at creation (a duplicate business key fails outright)." Read
   literally, that's **global** uniqueness across every tenant on the installation — two
   unrelated tenants both wanting `LAUNCH50` would collide, a real, plausible conflict nothing
   in ADR 0019 anticipated or intended.
3. **`invite` never received a complete actor shape anywhere.** Its fields are scattered across
   ADR 0018 (existence), 0021/0023 (contactId correction, elevated-permissions bootstrap use),
   0047 (`roles` validation), 0053 (status lifecycle) — individually correct, never assembled.

## Decision

`provider` becomes its own `consequent` actor, composite-keyed like `roleDefinition`.

### `provider` becomes its own `consequent` actor, composite-keyed like `roleDefinition`

```ts
{
  actor: { namespace: 'tower', type: 'provider', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',           // `${tenant}:${name}` — see roleDefinition, ADR 0047, same reasoning
    tenant: '', name: '',
    discoveryUrl: '', clientId: '', scope: [],
    status: 'active' | 'removed',                                    // ADR 0053
    discoveryStatus: { status: 'ok' | 'unavailable', checkedAt: '', error: null },  // ADR 0073
  }
}
```

`clientSecret` is never part of this state — pushed directly to signet at set/rotate time,
unchanged from ADR 0020's original discipline. `tenant.providers` (ADR 0020's original nested
map) is retired as a state field; `tenant` itself now aggregates `application`/`provider`
instances directly via `consequent`'s real `aggregateFrom` mechanism — no separate
`portcullisBundle` view actor, resolved in full by
[tower Story 001](../stories/tower/001-actor-definitions.md) once this correction's aggregation
question was actually checked against `consequent`'s source rather than assumed. This is a
small, mechanical correction, not a behavior change — every route, permission, and lifecycle
rule ADR 0030/0051/0053/0073 already established for "the provider resource" is unchanged; only
its underlying representation moves from a nested field to a real actor.

### `inviteCode.identifiedBy` becomes `{tenant}:{code}`

```ts
{
  actor: { namespace: 'tower', type: 'inviteCode', identifiedBy: 'key',
           searchableBy: ['issuedBy', 'tenant', 'status'] },
  state: {
    key: '',            // `${tenant}:${code}`
    code: '', tenant: '', application: '', issuedBy: '',
    roles: [], trialDurationDays: null, maxRedemptions: null,
    redemptionCount: 0, status: 'active', expiresAt: null,
  }
}
```

Closes the cross-tenant collision gap directly: `LAUNCH50` can now exist independently under
two different tenants without conflict, while remaining exactly as human-chosen/memorable as
ADR 0019 intended within any one tenant. Redemption already happens within an already-resolved
tenant context (the redeemer is on a specific tenant's OIDC login flow before a code is ever
checked), so this requires no change to how redemption itself works — only how the code is
looked up internally (`{tenant}:{code}`, not bare `code`).

### `invite` — assembled into one complete, confirmed shape

```ts
{
  actor: { namespace: 'tower', type: 'invite', identifiedBy: 'token',
           searchableBy: ['tenant', 'contactId', 'status'] },
  state: {
    token: '', tenant: '', application: null,   // null = tenant-wide, matching inviteCode's own optionality
    contactId: '',                                // ADR 0023's correction from a raw email field
    roles: [],                                     // { name, scope }, validated at creation (ADR 0047)
    permissions: [],                                // elevated-permissions bootstrap case (ADR 0021/0067)
    status: 'pending' | 'accepted' | 'revoked' | 'expired',
    expiresAt: null,
    createdAt: '', createdBy: '',
  }
}
```

`token` stays a bare (non-composite) key — unlike `inviteCode`, it's a long, high-entropy random
string generated by tower itself, not a human-chosen value, so cross-tenant collision is
already negligible by construction; no correction needed there. `DELETE` remains an alias for
`PATCH { status: "revoked" }` (ADR 0053), unchanged.

## Consequences

- `tenant.providers` is removed as a state field; `provider` becomes a first-class actor.
- `inviteCode`'s business key changes from `code` to `{tenant}:{code}` — a breaking change to
  the key shape, but this design has no running system yet to migrate, so it costs nothing to
  fix now rather than carrying the collision risk into implementation.
- `invite` finally has one authoritative, complete shape instead of scattered field mentions.
- The `provider`/`application` aggregation question this ADR originally flagged as needing its
  own pass is resolved — `tenant` aggregates both directly via `aggregateFrom`, no separate view
  actor, no expansion to `consequent` needed; see
  [tower Story 001](../stories/tower/001-actor-definitions.md).

## Related

- [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0053](0053-lifecycle-status-consolidation.md), [ADR 0073](0073-provider-discovery-status-feedback.md)
