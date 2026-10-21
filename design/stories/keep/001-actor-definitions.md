---
title: "Story 001: Keep Actor Definitions"
updated: 2026-08-05
status: draft
---
# Story 001 — Keep Actor Definitions

**Epic:** Domain Model
**Repo:** keep
**Status:** Draft
**New — consolidates the actor model scattered across adrs/0018–0083 into one
implementation-ready reference.** Per [tech-stack.md](../../tech/tech-stack.md)'s choice of
`consequent`/`consequent-postgres`/`fount`/`node-flakes` (shared with tower/herald) and
[tower Story 001](../tower/001-actor-definitions.md)'s established conventions, reused here
rather than re-derived.

---

## Summary

Same domain-model shape as tower — `consequent` actors, one module per type, `_actor.ts` files
under `./actors/`. Every shape below is the **final**, corrected form; [ADR 0083](../../adrs/0083-keep-actor-boundary-corrections.md)
fixed several real gaps found while assembling this reference (two composite-key corrections
identical in kind to tower's `inviteCode` fix, two missing Stripe-object-id fields, and explicit
`identifiedBy`/`searchableBy` for every actor — none had been declared anywhere before now).

`stripe-config` is **not** an actor — secret-only storage, structurally identical to tower's
`provider.clientSecret` pattern (write-only route, pushed straight to keep's own signet bundle,
never persisted in the event log). Covered in its own section below for completeness, not
because it's a domain object.

---

## Conventions Every Actor Follows

Identical to [tower Story 001](../tower/001-actor-definitions.md)'s conventions section — same
namespace-per-service pattern (`namespace: 'keep'` here), same no-physical-delete-except-one
rule (keep has no `contact`-shaped exception; nothing here is ever hard-deleted), same
server-side `tenant` enforcement (cross-tenant is `404`, not `403`), same never-a-state-field
rule for secrets.

---

## `customer`

```ts
{
  actor: { namespace: 'keep', type: 'customer', identifiedBy: 'id',
           searchableBy: ['tenant', 'scope', 'stripeCustomerId'] },
  state: { tenant: '', scope: { account: '' } | { tenant: '' }, stripeCustomerId: '' },
}
```

- [ ] `id` is a generated `node-flakes` id — **not** derived from `scope`, even though a
      tenant-scoped and an account-scoped customer are structurally different lookups; both are
      just "a customer record" and don't need different key shapes (ADR 0083).
- [ ] `searchableBy` includes `stripeCustomerId` specifically because the webhook handler that
      creates these on first completed checkout needs to check for an already-existing record
      before creating a duplicate.
- [ ] Never created by an admin call — always webhook-driven, first `checkout.session.completed`.
- [ ] Resolves against **the tenant's own** Stripe account (ADR 0046) — this shape's ownership
      premise was corrected once already (originally a single installation-wide account, ADR
      0042); the shape itself never changed across that correction.

**ADRs:** 0042 (shape origin, superseded ownership premise), 0046 (ownership corrected —
controlling), 0083 (`identifiedBy`/`searchableBy` made explicit for the first time).

---

## `planMapping`

```ts
{
  actor: { namespace: 'keep', type: 'planMapping', identifiedBy: 'id',
           searchableBy: ['tenant', 'stripePriceId', 'status'] },
  state: {
    tenant: '', stripePriceId: '', name: '', seatLimit: null, grantedRoles: [], meter: null,
    unitAmount: null, currency: '', interval: 'month',   // 'month' | 'year'
    status: 'active',   // active | retired
  }
}
```

- [ ] **Fully tenant-defined**, including writes (`billing:manage`) — this was briefly corrected
      to operator-defined under a since-superseded single-account premise (ADR 0042) and
      operator-only-writes restriction (ADR 0045), both reversed by ADR 0046. Treat ADR 0038's
      *original* framing as correct.
- [ ] `meter` set → this is a metered price; ties usage recording to billing without a separate
      catalog (ADR 0043).
- [ ] `unitAmount`/`currency`/`interval` are a **cache**, synced from Stripe (the tenant's own
      key) at create/edit time and by a periodic re-sync job — Stripe stays authoritative; this
      exists only to support `revenue-summary` without a live Stripe call on every read (ADR
      0060).
- [ ] **Writes validate `grantedRoles` against keep's local, tower-sourced reference cache**
      (applications + active role definitions, seeded by a startup backfill and periodic re-run,
      ADR 0047) — rejects a `grantedRoles` entry referencing an unknown or inactive
      application/role rather than silently accepting an inert grant. This is real and current
      today, not a stated-but-unbuilt aspiration (ADR 0083's clarification of ADR 0046/0047).
- [ ] `DELETE` is an alias for `PATCH { status: "retired" }` — a real delete would break renewal
      processing for existing subscribers still on the plan (ADR 0053). Keep's own webhook
      lookup must still find and honor `retired` mappings; only the admin create/upgrade flow
      filters to `active`.

**ADRs:** 0038 (origin, restored), 0042/0045 (superseded ownership/write restriction), 0043
(`meter`), 0046 (ownership/writes, controlling), 0047 (reference-cache validation), 0053
(`status`), 0060 (cached pricing fields), 0083 (`identifiedBy`/`searchableBy`, contradiction
clarified).

---

## `subscription`

```ts
{
  actor: { namespace: 'keep', type: 'subscription', identifiedBy: 'stripeSubscriptionId',
           searchableBy: ['tenant', 'scope', 'status'] },
  state: {
    tenant: '', scope: { account: '' } | { tenant: '' },
    stripeSubscriptionId: '', stripePriceId: '',
    status: 'active',   // active | past_due | canceled | trialing
    currentPeriodEnd: '',
  }
}
```

- [ ] **Keyed directly by `stripeSubscriptionId`** — unlike `usageRecord`'s app-supplied key
      (below), this id is Stripe-generated and globally unique; no tenant-prefixing needed, and
      keying it directly makes every webhook update (`customer.subscription.updated`/`.deleted`)
      a direct fetch, not a search (ADR 0083).
- [ ] Read-only through the API, **no `DELETE` route at all** — state changes are exclusively
      webhook-driven (ADR 0053 confirms this explicitly, not merely an oversight).

**ADRs:** 0038 (origin), 0046 (ownership account corrected), 0053 (confirms no `DELETE`), 0083
(`identifiedBy` made explicit).

---

## `trial`

```ts
{
  actor: { namespace: 'keep', type: 'trial', identifiedBy: 'id',
           searchableBy: ['tenant', 'scope', 'status'] },
  state: {
    tenant: '', scope: { account: '' } | { tenant: '' },
    grantedRoles: [], seatLimit: null,   // seatLimit only meaningful for tenant scope
    expiresAt: '', status: 'active',      // active | converted | expired
    extensions: [ { by: '', at: '', newExpiresAt: '' } ],
  }
}
```

- [ ] `extensions` is the actual audit mechanism behind "an admin extends or reissues a trial" —
      extend and reissue are the same operation, appending a new entry; `PATCH { expiresAt }` is
      how it's triggered (ADR 0039/0041).
- [ ] Exists independent of any `subscription` — converting (an admin or webhook-driven action)
      creates a real `subscription` and moves `status` to `"converted"`.
- [ ] `DELETE` is an alias for `PATCH { status: "expired" }` — revoke is immediate expiration, no
      separate state value needed (ADR 0053).

**ADRs:** 0039 (origin), 0053 (`DELETE`-alias correction), 0083 (`identifiedBy`/`searchableBy`).

---

## `coupon`

```ts
{
  actor: { namespace: 'keep', type: 'coupon', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',   // `${tenant}:${code}`
    code: '', tenant: '',
    grantedRoles: [], trialDurationDays: null, seatLimit: null,
    maxRedemptions: null, redemptionCount: 0,
    status: 'active',   // active | revoked | expired
    expiresAt: '',
  }
}
```

- [ ] `code` may repeat freely **across** tenants — only `key` (`{tenant}:{code}`) must be
      unique (ADR 0083, the identical fix ADR 0082 applied to `inviteCode`).
- [ ] Scoped only to grants *beyond* a price adjustment (bonus trial period, seats, roles) —
      pure percentage/fixed-amount discounts are Stripe's native Coupon/Promotion Code objects,
      zero keep-side modeling (ADR 0039).
- [ ] A combined marketing code (`LAUNCH50` meaning both "let me in" and "50% off") is a
      `web`/admin-level convention — a matching `inviteCode` (tower) and `coupon` (keep) sharing
      the same code string, checked by the redemption flow. No shared code primitive between the
      two services; the tower/keep boundary (ADR 0018) holds.
- [ ] Originally shipped with **no `PATCH` route at all** despite having a `status` field — fixed
      (ADR 0053): `PATCH { status: "revoked" }` is the real mechanism, `DELETE` an alias.

**ADRs:** 0039 (origin), 0053 (adds `PATCH`, `DELETE` alias), 0083 (composite key correction).

---

## `usageRecord`

```ts
{
  actor: { namespace: 'keep', type: 'usageRecord', identifiedBy: 'key',
           searchableBy: ['tenant', 'application', 'meter'] },
  state: {
    key: '',   // `${tenant}:${idempotencyKey}`
    tenant: '', application: '', accountId: '',
    meter: '', quantity: 0, idempotencyKey: '',
    createdAt: '',
  }
}
```

- [ ] `key` is tenant-scoped specifically because `idempotencyKey` is **application-supplied**,
      not internally generated — a less trusted source than this design's other identifiers, and
      the one place a naive/predictable caller-supplied value could plausibly collide across
      tenants (ADR 0083).
- [ ] Rejects unrecognized `meter` values — validated against the tenant's own metered
      `planMapping` entries, not recorded against nothing (ADR 0043).
- [ ] No `DELETE` — already correctly immutable, API/webhook-driven only (ADR 0053).
- [ ] Publishes `entitlement.usage-updated` downstream — **current-value-replace, not a delta**
      (the same shape ADR 0031's `seat-limit-changed` already established): `{ tenant, scope,
      application, meter, periodUsage, periodLimit, sequence }`. A redelivered or out-of-order
      copy applied twice produces the same result.

**ADRs:** 0043 (origin, idempotency, meter validation), 0031 (current-value-replace shape
reused), 0053 (confirms no `DELETE`), 0079 (second ingress converging on identical recording
logic), 0083 (composite key correction).

---

## `usageReportingCredential`

```ts
{
  actor: { namespace: 'keep', type: 'usageReportingCredential', identifiedBy: 'credentialId',
           searchableBy: ['tenant', 'application', 'status'] },
  state: {
    tenant: '', application: '', credentialId: '', hashedSecret: '',
    status: 'active',   // active | revoked
    createdAt: '',
  }
}
```

- [ ] Deliberately narrow — reports usage only, nothing else. Secret returned **once** at
      creation; only a salted hash stored. **Not** a signet secret — this credential is held by
      an external adopting application's own backend, outside authstar's trust boundary
      entirely, so signet's distribution model doesn't fit (ADR 0079).
- [ ] Multiple concurrent credentials per application allowed by design — rotation is
      create-new-then-delete-old, never a forced single-active-credential downtime window.
- [ ] Verified via `Authorization: Bearer <credential>` against the stored hash, **plus** a
      cross-check that the credential's own `tenant`/`application` match what portcullis resolved
      from `Host` — defense in depth against a leaked credential being replayed against a
      different application's host (ADR 0079).

**ADRs:** 0079 (sole source, unchanged since), 0083 (confirms `identifiedBy` already correct as
originally specified — no fix needed here, unlike the two composite-key corrections above).

---

## `refund`

```ts
{
  actor: { namespace: 'keep', type: 'refund', identifiedBy: 'stripeRefundId',
           searchableBy: ['tenant', 'stripeChargeId'] },
  state: {
    tenant: '', scope: { account: '' } | { tenant: '' },
    stripeChargeId: '', stripeRefundId: '',
    amount: 0, currency: '', reason: '', refundedAt: '',
  }
}
```

- [ ] Keyed by `stripeRefundId`, **not** `stripeChargeId` — a charge can have multiple partial
      refunds; the charge id was never a safe key on its own (ADR 0083).
- [ ] Created on `charge.refunded`. **No automatic entitlement change** — a partial or goodwill
      refund shouldn't revoke access; a refund tied to an actual cancellation arrives separately
      via `customer.subscription.deleted`. Visibility/audit only (ADR 0077).
- [ ] Read-only — no write routes at all.

**ADRs:** 0077 (sole source), 0083 (`stripeRefundId` as the real key).

---

## `dispute`

```ts
{
  actor: { namespace: 'keep', type: 'dispute', identifiedBy: 'stripeDisputeId',
           searchableBy: ['tenant', 'stripeChargeId', 'status'] },
  state: {
    tenant: '', scope: { account: '' } | { tenant: '' },
    stripeChargeId: '', stripeDisputeId: '',
    status: 'needs_response',   // needs_response | under_review | won | lost
    amount: 0, currency: '', reason: '', createdAt: '',
  }
}
```

- [ ] `charge.dispute.created` → creates the record and **degrades entitlements**, reusing ADR
      0038's non-payment `grantedRoles`-only degrade pattern verbatim — the same reasoning ADR
      0038 already gave for treating structurally-similar problems the same way (ADR 0077).
- [ ] `charge.dispute.closed` (`won`) → reverses the degrade. `charge.dispute.closed` (`lost`) →
      updates the record only; any subscription-level consequence arrives independently via
      `customer.subscription.deleted`, not duplicated here.
- [ ] Read-only — no write routes at all.

**ADRs:** 0077 (sole source), 0083 (`stripeDisputeId` as the real key).

---

## `stripe-config` — secret storage, not an actor

```
GET, PATCH /tenants/{tenantSlug}/stripe-config
```

- [ ] `GET` never returns the secret key/webhook secret (write-only, same discipline as tower's
      `provider.clientSecret`). `PATCH` sets/rotates `tenant-<slug>-stripe-secret-key` and
      `tenant-<slug>-stripe-webhook-secret` directly into **keep's own** signet bundle via
      `SyncBundle`, using keep's own narrow `GitOpsService`-scoped admin token (ADR 0052) — never
      routed through tower as an intermediary, since (unlike portcullis) keep has its own admin
      API to receive the write directly.
- [ ] Validated at *set* time with a cheap Stripe API call (e.g. a balance retrieve) rather than
      silently accepting a bad key and discovering it's broken on the first real checkout or
      webhook (ADR 0054) — `web`'s connection-health indicator reflects this check's result, not
      just "a key is present."
- [ ] Gated by `billing:manage`. `consequent`'s event log records that a secret was set/rotated
      (who, when) — never its plaintext value, same discipline as every other secret in this
      design.

**ADRs:** 0052 (signet access mechanism), 0054 (validate-at-set-time behavior).

---

## Not Covered Here

- The full route inventory (methods, permission gates, list/detail/write shapes per route) — a
  future keep story, following the same pattern as tower's Story 004/005/etc.
- The Stripe webhook event-to-action table — already fully specified across ADR 0038/0046/0077;
  a future keep story wires it to these actor shapes, not re-derived here.
- `tower`'s and `herald`'s own actors — their own Story 001 equivalents.
