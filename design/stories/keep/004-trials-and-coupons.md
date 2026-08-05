# Story 004 — Trials and Coupons

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the routes [ADR 0041](../../decisions/0041-keep-api-surface.md) already
specifies.** Per [ADR 0018](../../decisions/0018-trial-roles-and-keep-boundary.md),
[ADR 0019](../../decisions/0019-invite-codes.md),
[ADR 0039](../../decisions/0039-keep-trials-and-coupons.md),
[ADR 0053](../../decisions/0053-lifecycle-status-consolidation.md),
[ADR 0083](../../decisions/0083-keep-actor-boundary-corrections.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `trial`/`coupon` shapes.

---

## Trials

### `POST /tenants/{tenantSlug}/trials` — create

- [ ] Gated by `billing:manage`. Body: `{ scope, grantedRoles, seatLimit, expiresAt }`.
      `grantedRoles` validated against the same local reference cache plan mappings use (Story
      003/ADR 0047) — no separate validation path.
- [ ] Publishes `entitlement.trial-granted` (ADR 0031's discrete-event shape, same family as
      `role-granted`) — tower merges `trialRoles` with `grantedRoles` at token-signing time only,
      never here (ADR 0018).

### `GET /tenants/{tenantSlug}/trials` / `GET .../trials/{id}`

- [ ] List filterable by `status`/scope, same convention as everywhere else.

### `PATCH /tenants/{tenantSlug}/trials/{id}` — extend or reissue

- [ ] Body: `{ expiresAt }`. Appends `{ by, at, newExpiresAt }` to `extensions` (Story 001) — the
      one, same operation for both "extend" and "reissue," a new array entry either way. Publishes
      `entitlement.trial-extended`.

### `DELETE /tenants/{tenantSlug}/trials/{id}` — revoke

- [ ] Alias for `PATCH { status: "expired" }` (ADR 0053) — immediate expiration, not a separate
      mechanism. Publishes `entitlement.role-revoked` for every role the trial granted.

### Conversion — not a route, a side effect of Story 002's webhook handling

- [ ] When a `checkout.session.completed`/`customer.subscription.created` webhook arrives for a
      `scope` that has an `active` trial, that trial's `status` moves to `"converted"` (Story 002)
      — no separate "convert" endpoint exists; conversion is discovered, not requested.

---

## Coupons

### `POST /tenants/{tenantSlug}/coupons` — create

- [ ] Gated by `billing:manage`. Body: `{ code, grantedRoles, trialDurationDays, seatLimit,
      maxRedemptions, expiresAt }`. `key` constructed as `{tenantSlug}:{code}` (Story 001/ADR
      0083's correction) — rejects if that exact key already exists (`active`, `revoked`, or
      `expired` — same historical-reference-stability reasoning as tower's `roleDefinition`/
      `provider`).
- [ ] `grantedRoles` validated the same way as plan mappings and trials — one shared validation
      path against the local reference cache, not three separate implementations of the same
      check.
- [ ] Scoped only to grants *beyond* a price adjustment — a coupon that's purely a Stripe-native
      percentage/fixed discount needs no record here at all (ADR 0039); this route exists for the
      bonus-trial/bonus-seats/bonus-roles case specifically.

### `GET /tenants/{tenantSlug}/coupons` / `GET .../coupons/{code}`

- [ ] `{code}` in the URL is the bare code — constructed into the full `{tenantSlug}:{code}` key
      internally, same pattern as tower's `provider`/`inviteCode` route parameters (never exposing
      the composite key to callers).

### `PATCH /tenants/{tenantSlug}/coupons/{code}` — `{ status: "revoked" }`

- [ ] The actual mechanism, added by ADR 0053 (originally had `status` with no `PATCH` route at
      all — a real gap that ADR fixed).

### `DELETE /tenants/{tenantSlug}/coupons/{code}`

- [ ] Alias for the `PATCH` above (ADR 0053).

### Redemption

- [ ] Not a `web`-facing endpoint on this surface — redemption happens wherever a checkout flow
      applies a coupon code (the actual mechanics of *where* a customer enters a code are a
      `web`/checkout-flow concern, not designed in this story). On successful redemption: append
      `grantedRoles` to the resulting entitlement grant (permanent if `trialDurationDays` is
      unset, or feeding a `trial` creation if it is set — the same permanent-vs-trial branch
      tower Story 007 designed for `inviteCode`, mirrored here since `coupon` was explicitly
      modeled close to it), increment `redemptionCount`. **No per-redeemer attribution** — same
      honestly-named limitation as `inviteCode` (ADR 0056): neither actor records *who* redeemed
      a given instance, only a running count.

---

## Not Covered Here

- The combined invite-code-plus-coupon marketing-code convention (`web`/admin-level, matching
  code strings across tower's `inviteCode` and this `coupon`) — already resolved at the ADR level
  (ADR 0039/0019), no new tower or keep mechanism, not re-designed here.
- Where in a checkout flow a coupon code is actually entered — `web`'s concern.
