---
title: "Story 003: Plan Mappings, Checkout Sessions, and Billing Reads"
updated: 2026-08-05
status: draft
---
# Story 003 — Plan Mappings, Checkout Sessions, and Billing Reads

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the routes [ADR 0041](../../adrs/0041-keep-api-surface.md) already
specifies.** Per [ADR 0038](../../adrs/0038-plan-mapping-and-subscription-tracking.md),
[ADR 0041](../../adrs/0041-keep-api-surface.md),
[ADR 0046](../../adrs/0046-tenant-owned-stripe-configuration.md),
[ADR 0047](../../adrs/0047-application-and-role-slug-validation.md),
[ADR 0053](../../adrs/0053-lifecycle-status-consolidation.md),
[ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `planMapping`/`customer`/`subscription`
shapes, [Story 002](002-stripe-webhook-handling.md)'s webhook-driven writes (this story is the
admin-facing read/write surface those writes feed).

---

## Plan Mappings

### `POST /tenants/{tenantSlug}/plan-mappings` — create

- [ ] Gated by `billing:manage`. Body: `{ stripePriceId, name, seatLimit, grantedRoles, meter }`.
- [ ] `stripePriceId` references a Price on the **tenant's own** Stripe account — keep has no
      opinion on how it came to exist, no validation against Stripe beyond what the cached-pricing
      sync (below) naturally surfaces if it's wrong.
- [ ] `grantedRoles` validated against keep's local, tower-sourced reference cache (applications
      + active role definitions, Story 001/ADR 0047) — rejects an unknown application or
      unregistered role outright.
- [ ] `unitAmount`/`currency`/`interval` are fetched from Stripe at creation time and cached
      (Story 001) — not accepted in the request body, since Stripe is authoritative for pricing.

### `GET /tenants/{tenantSlug}/plan-mappings` — list

- [ ] Defaults to `status: "active"` only, with a toggle to include `"retired"` — same convention
      as every other lifecycle list in this design.

### `GET`/`PATCH`/`DELETE /tenants/{tenantSlug}/plan-mappings/{id}`

- [ ] `PATCH` accepts the same fields as creation, same `grantedRoles` validation. `DELETE` is an
      alias for `PATCH { status: "retired" }` (ADR 0053) — **keep's own webhook lookup (Story
      002) must still resolve a retired mapping by `stripePriceId`**, since an existing
      subscriber's renewal event still needs to look up what they're on; only the admin
      create/upgrade-facing `GET` list filters retired ones out by default.

### Periodic pricing re-sync

- [ ] A scheduled job (same operational shape as ADR 0012's provisioner `CronJob`/ADR 0029's
      retention sweep — this design's established pattern for "needs to run periodically, no new
      mechanism") re-fetches `unitAmount`/`currency`/`interval` from Stripe for every `active`
      `planMapping` and updates the cache if Stripe's own value has changed. Keeps
      `revenue-summary` (below) from silently drifting from what Stripe actually charges.

---

## Checkout Sessions

### `POST /tenants/{tenantSlug}/checkout-sessions`

- [ ] Creates a Stripe Checkout Session for a given `planMapping`, returns the redirect URL —
      the actual mechanism `/_authstar/upgrade` (ADR 0065/0066) redirects to. Not a primary admin
      screen action (ADR 0054) — the normal caller is the upgrade flow itself, an admin-initiated
      "send this customer a checkout link" is a secondary, smaller affordance on the same route.
- [ ] Body: `{ planMappingId, scope: { account: '' } | { tenant: '' } }` — resolves or creates
      the matching `customer` record (Story 001) for that scope before creating the session, so
      a second checkout for the same customer reuses their existing Stripe Customer object rather
      than creating a duplicate.

---

## Read-only billing surfaces

### `GET /tenants/{tenantSlug}/customer` / `GET /tenants/{tenantSlug}/accounts/{accountId}/customer`

- [ ] Read-only — `customer` is always webhook-created (Story 001/002), never admin-created.

### `GET /tenants/{tenantSlug}/subscriptions` / `GET .../subscriptions/{id}`

- [ ] Read-only — entirely webhook-driven (Story 001/002), no write routes exist on this surface
      at all.

### `GET /tenants/{tenantSlug}/refunds` / `GET .../disputes`

- [ ] Gated by `billing:read`. Read-only, webhook-populated (Story 001/002, ADR 0077) — already
      fully specified there, listed here only to confirm they sit alongside the rest of this
      read-only billing surface.

### `GET /tenants/{tenantSlug}/revenue-summary`

- [ ] Gated by `billing:read`, distinct from `billing:manage` (ADR 0060) — MRR and active-
      subscription counts by status/plan, computed from `subscription` + `planMapping`'s cached
      pricing fields (Story 001) — no live Stripe call on read, the entire reason the pricing
      cache exists.

---

## Not Covered Here

- Webhook-driven writes to `customer`/`subscription`/`refund`/`dispute` — [Story 002](002-stripe-webhook-handling.md).
- `activity` — keep's own activity route shares the tenant/keep/herald merged shape; a future
  story, same pattern as [tower Story 010](../tower/010-activity-feed.md).
- Trials, coupons, usage records, usage-reporting credentials — each a future story, not folded
  in here despite living on the same route surface, since they're independent enough concerns
  to warrant their own.
