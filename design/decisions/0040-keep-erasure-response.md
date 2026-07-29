# ADR 0040: Keep's Response to Contact Erasure

- **Status:** Accepted
- **Date:** 2026-07-29
- **Affects:** tower, keep
- **Resolves the deferred item in:** [ADR 0026](0026-erasure-cascade.md)
- **Amends the payload of:** `contact.purged` (ADR 0026)

## Context

Designing keep's response surfaced a real gap in the existing contract, not just a missing
policy decision. `contact.purged` (ADR 0026) carries `{ tenant, contactId }`. Keep's actors
(`subscription`, `trial`, `coupon`, `planMapping` — ADR 0038/0039) are keyed by `accountId` or
`tenant`, never `contactId` directly. Since keep never calls tower directly (ADR 0018), it has
no way to correlate an incoming `contactId` to the `accountId` its own records reference —
without a fix, keep would receive an erasure notice it's structurally unable to act on.

## Decision

### `contact.purged` gains `accountId`

Tower already knows the relevant `accountId` (via `account.contactId`, ADR 0023) at the moment
it deletes the `contact` row, before publishing the event — including it costs nothing and
closes the correlation gap for keep and any future `accountId`-keyed subscriber:

```ts
{ tenant: '', contactId: '', accountId: '' }
```

### Keep's own actors need no changes on erasure — they were never PII-bearing

`subscription`/`trial`/`coupon`/`planMapping` reference `accountId`, not contact data directly
— the same reasoning that already lets tower's own `account`/`identity` survive erasure as
inert, unresolvable-without-`contact` records (ADR 0023). Keep acknowledges the cascade
(`contact.purge.acknowledged`, ADR 0026) once it confirms this, without needing to touch any of
its own consequent-managed state.

### Stripe Customer data is the tenant's own data-controller responsibility, not keep's

This is the piece ADR 0026 actually left open, and it resolves cleanly from ADR 0037's own
principle rather than needing new machinery: the Stripe Customer object (billing email, name,
tax address) lives on the **tenant's own connected Stripe account**. Since the tenant owns the
merchant relationship (ADR 0037), *they* are the data controller for their own customer
records, subject to their own legal retention obligations (tax/accounting law under GDPR
Article 17(3)'s legal-obligation exception, exactly as ADR 0026 anticipated) — not authstar.
Keep does not reach into the tenant's Stripe account to delete or anonymize their Customer
object on an erasure request. Acknowledging the cascade reflects that keep's own state is
clear, not that all downstream data everywhere has been purged — the same distinction any
cascade participant with a legal-retention carve-out would need to make.

## Consequences

- Tower's `contact.purged` publisher needs the `accountId` lookup added before publishing.
- Any future `accountId`-keyed service joining the erasure cascade gets this correlation for
  free, rather than needing to solve it again.
- If a tenant ever needs to actually delete a Stripe Customer record (e.g. to comply with their
  own end-user's request under their own privacy obligations), that's a tenant-initiated action
  through their own Stripe dashboard or a future `web`-exposed convenience for it — not
  something keep does automatically as part of this cascade.

## Related

- [ADR 0026](0026-erasure-cascade.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md)
