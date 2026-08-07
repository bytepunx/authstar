# Story 003 — Tenant Operator Context: Admin Access and OIDC Providers

**Epic:** Operator Console
**Repo:** steward
**Status:** Draft
**New — steward's side of the screens [ADR 0048](../../decisions/0048-steward-ux.md) already
specifies.**
**Depends on:** [tower Story 005](../tower/005-accounts-roles-and-permissions.md)'s account/
permission routes, [tower Story 007](../tower/007-invites-and-invite-codes.md)'s invite
creation, [tower Story 004](../tower/004-applications-and-providers.md)'s provider routes — all
reached via the operator tree (same handlers, bearer-token auth, no tenant restriction).

---

## Summary

Two sections, deliberately narrow — not a general admin dashboard. Everything here calls a route
already fully specified in tower's own Stories; nothing in this story invents new backend
behavior, only the operator-facing screens over it.

---

## Admin Access

### Read — who already has elevated access

- [ ] Calls `GET /operator/tenants/{tenantSlug}/accounts` (the same route
      [tower Story 005](../tower/005-accounts-roles-and-permissions.md) specifies, operator
      tree) and filters client-side to accounts with a non-empty `permissions` array — permission
      holders should be a small population, not worth a dedicated backend filter for this (ADR
      0048's own reasoning, unchanged).

### Recovery path — grant/revoke on an existing account

- [ ] Search by email — `GET /operator/tenants/{tenantSlug}/accounts?email=...`
      ([tower Story 005](../tower/005-accounts-roles-and-permissions.md)'s email search, resolved
      server-side via the `contact` HMAC lookup, reached via the operator tree with no
      `contacts:read` grant needed since the operator token bypasses tenant-scoped `permissions`
      checks entirely).
- [ ] Select an account, add/remove `permissions` grants — `POST`/`DELETE
      /operator/tenants/{tenantSlug}/accounts/{accountId}/permissions[/{grant}]`. **This is the
      one place in the whole design where granting `permissions` genuinely is exempt from the
      normal `permissions:manage` gate** — not because self-action rules apply (they don't,
      [tower Story 005](../tower/005-accounts-roles-and-permissions.md) was explicit that grant
      routes are never self-actionable), but because the **operator bearer token itself** is the
      authorization here, structurally outside the tenant-scoped `permissions` system entirely
      (ADR 0021). Worth stating plainly so this isn't mistaken for a loophole in Story 005's
      security correction — it's a different, intentionally separate auth model, not an exception
      carved into the same one.

### Bootstrap path — issue an elevated invite

- [ ] Target email, tenant-wide or application-scoped, which `permissions` to grant on
      acceptance — calls `POST /operator/tenants/{tenantSlug}/invites`
      ([tower Story 007](../tower/007-invites-and-invite-codes.md)'s invite creation, operator
      tree), the same elevated-bootstrap case ADR 0021/0067 already established, reused
      unchanged here.

---

## OIDC Providers

- [ ] Read: configured providers and non-secret fields (`discoveryUrl`, `clientId`, `scope`) —
      `GET /operator/tenants/{tenantSlug}/providers`
      ([tower Story 004](../tower/004-applications-and-providers.md)'s list route, operator
      tree).
- [ ] Add: full provider form including `clientSecret` — write-only, never redisplayed once
      saved (same discipline as every other secret in this design). Calls `POST
      /operator/tenants/{tenantSlug}/providers`.
- [ ] Edit non-secret fields; rotate (not view) the secret; remove — `PATCH`/`DELETE
      /operator/tenants/{tenantSlug}/providers/{name}`, including the two removal safeguards
      already enforced tower-side (last-provider-`_admin`-exposes, still-referenced-by-an-active-
      application) — steward doesn't duplicate these checks client-side, it just surfaces
      whatever error tower returns when a removal is rejected.
- [ ] **Discovery status is visible here too** — `discoveryStatus` (tower Story 001/004) rides
      along on the same `GET` response; an operator fixing a broken provider on a tenant's behalf
      benefits from the exact same "healthy" / "discovery failing since {checkedAt}" indicator
      `web`'s own Providers screen shows (ADR 0073), not a separate operator-only view of it.

---

## Not Covered Here

- Tenant search/creation (the screen that leads into this context) —
  [Story 002](002-tenant-search-and-creation.md).
- Activity and Stuck Erasure Requests — [Story 004](004-activity-and-stuck-erasure-requests.md).
- Herald Keys and tenant key rotation — [Story 005](005-key-rotation-screens.md).
