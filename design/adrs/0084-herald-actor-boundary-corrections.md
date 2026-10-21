# ADR 0084: Herald Actor Boundary Corrections — Keys Finally Declared

- **Status:** Accepted
- **Date:** 2026-08-05
- **Affects:** herald
- **Corrects:** [ADR 0022](0022-herald-communications-service.md)

## Context

The same consolidation exercise [ADR 0082](0082-tower-actor-boundary-corrections.md) and
[ADR 0083](0083-keep-actor-boundary-corrections.md) did for tower and keep, applied to herald,
found the same class of gap — arguably worse here, since **no herald actor anywhere has ever had
an explicit `identifiedBy` declared**, not even the ones later ADRs treated as if it were settled
(`optOut` was re-keyed by ADR 0023 without ever restating a full business key).

Two of these are genuine, unresolved collision risks, not just missing documentation:

1. **`communicationType`'s only confirmed key material is the bare route parameter `{type}`** —
   a conventional slug like `invite-sent`. This is a *more* likely collision than any case fixed
   so far: `inviteCode`/`coupon` risked collision on a human-chosen marketing string, and
   `usageRecord` on an app-supplied value — `communicationType` risks it on a name every tenant
   is *expected* to reuse by convention (tower's own publishers send a fixed `type` like
   `"invite-sent"` regardless of tenant), making an unscoped collision the likely case, not an
   edge case.
2. **`communication.identifiedBy` (`idempotencyKey`) is publisher-supplied and not tenant-scoped**
   — the same soft risk `usageRecord` had before [ADR 0083](0083-keep-actor-boundary-corrections.md)
   fixed it, here depending entirely on every publisher (tower, keep, portcullis) happening to
   embed enough entropy/tenant-uniqueness in whatever idempotency key it generates, with nothing
   in herald's own contract enforcing it.

The rest are missing declarations rather than live risks, closed here for completeness now that
the pattern of leaving them undeclared has caused confusion twice already.

## Decision

### `communicationType.identifiedBy` becomes `{tenant}:{type}`

```ts
{
  actor: { namespace: 'herald', type: 'communicationType', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',   // `${tenant}:${type}`
    type: '', tenant: '', category: 'transactional' | 'marketing',
    retentionDays: 30, status: 'active' | 'deprecated',
  }
}
```

`template.communicationType` (ADR 0025) stays a **bare type string**, not this composite key —
templates and communication types are only loosely coupled by a shared naming convention, not a
strict foreign-key reference: a global-default `template` (`tenant: null`) can exist keyed by a
`communicationType` string like `"invite-sent"` before any specific tenant has created their own
`communicationType` row for it at all. Tightening this into a hard reference isn't needed and
would break the global-default case for no benefit.

### `communication.identifiedBy` becomes `{tenant}:{idempotencyKey}`

```ts
{
  actor: { namespace: 'herald', type: 'communication', identifiedBy: 'key', ... },
  state: {
    key: '',   // `${tenant}:${idempotencyKey}`
    idempotencyKey: '',   // kept as its own field too, for publisher-facing reference
    ...   // every other field unchanged (ADR 0025/0029/0033/0074/0081)
  }
}
```

Closes the gap definitively rather than leaving correctness dependent on every current and future
publisher happening to embed tenant-uniqueness in their own idempotency scheme — the same fix,
same reasoning, ADR 0083 already applied to `usageRecord`.

### `optOut` and `suppression` — bare `contactId` confirmed safe, made explicit

```ts
// optOut
{ actor: { namespace: 'herald', type: 'optOut', identifiedBy: 'contactId',
           searchableBy: ['tenant'] },
  state: { tenant: '', contactId: '', optedOutCategories: [] } }

// suppression
{ actor: { namespace: 'herald', type: 'suppression', identifiedBy: 'contactId',
           searchableBy: ['tenant', 'reason'] },
  state: { tenant: '', contactId: '', reason: 'hard-bounce' | 'complaint' | 'manual',
           createdAt: '' } }
```

**No composite-key fix needed here** — `contactId` is already an HMAC keyed by a per-tenant
pepper (ADR 0023), so it's cryptographically tenant-differentiated even without a literal
`{tenant}:` prefix. The exact same reasoning [ADR 0082](0082-tower-actor-boundary-corrections.md)
gave for leaving `invite.token` uncorrected (a sufficiently unguessable, already-differentiated
value doesn't need a redundant prefix) — just never stated explicitly for these two until now.

### `template` — confirmed generated, no fix, gap closed by declaration only

```ts
{ actor: { namespace: 'herald', type: 'template', identifiedBy: 'templateId',
           searchableBy: ['tenant', 'communicationType'] },
  state: { communicationType: '', tenant: null, version: 1,
           subjectTemplate: '', bodyTemplate: '', createdAt: '' } }
```

`templateId` is herald-generated (`node-flakes`, matching cross-service convention), not
user-chosen — no collision risk, same category as `invite.token`. Declared explicitly for the
first time; no shape or behavior change.

### `sending-config` — confirmed correct as-is

Keyed by bare `tenant` (a true singleton, one per tenant) — this is the intentional, correct key
shape, not an instance of the risk this ADR addresses elsewhere. No change.

## Consequences

- `communicationType` and `communication` both gain composite, tenant-scoped keys — breaking
  changes to their key shape, costing nothing to fix now given no running system exists yet to
  migrate (same posture as every prior correction of this kind).
- `optOut`/`suppression`/`template` gain their first-ever explicit `identifiedBy` declarations,
  no behavior change.
- Closes the same class of gap ADR 0082/0083 already closed for tower and keep — herald was the
  last of the three `consequent`-backed services to receive this pass.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0074](0074-herald-bounce-complaint-and-suppression.md), [ADR 0082](0082-tower-actor-boundary-corrections.md), [ADR 0083](0083-keep-actor-boundary-corrections.md) (the same pattern of correction, applied to tower and keep first)
