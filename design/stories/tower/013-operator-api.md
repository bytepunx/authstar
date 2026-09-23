# Story 013 — Operator API

**Epic:** Operator Access
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0021](../../decisions/0021-cli-operator-bootstrap.md)/
[ADR 0048](../../decisions/0048-steward-ux.md)/[ADR 0075](../../decisions/0075-stuck-erasure-request-monitoring.md)
already specify.** Per [ADR 0021](../../decisions/0021-cli-operator-bootstrap.md),
[ADR 0023](../../decisions/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0030](../../decisions/0030-tower-api-surface.md),
[ADR 0045](../../decisions/0045-steward-operator-console.md),
[ADR 0048](../../decisions/0048-steward-ux.md),
[ADR 0075](../../decisions/0075-stuck-erasure-request-monitoring.md).
**Depends on:** Stories 004, 005, 007, 010, 011 — most of this surface is those same handlers,
reused, not reimplemented.

---

## Most of the operator API is "the tenant-scoped route, operator auth, no tenant restriction"

ADR 0030's own framing: the operator tree "reuses the **same route handlers**... The only
differences are the auth middleware and the removal of the same-tenant restriction." This story
doesn't re-describe any of the following — they're already fully specified in their own stories
and apply unchanged, just reachable at `/operator/...` with the bearer-token auth model (ADR
0021) instead of `permissions`:

- **Admin access management** — `steward`'s "recovery path" (search an account, grant/revoke
  `permissions`) is [Story 005](005-accounts-roles-and-permissions.md)'s account/permission
  routes; the "bootstrap path" (issue an elevated invite) is
  [Story 007](007-invites-and-invite-codes.md)'s invite creation, unchanged.
- **OIDC provider management** — [Story 004](004-applications-and-providers.md)'s provider
  routes, in full (add, edit, rotate secret, remove).
- **Tenant status / key rotation** — already described as operator routes directly in
  [Story 011](011-tenant-management-and-key-rotation.md), not repeated here.
- **Cross-tenant activity** — [Story 010](010-activity-feed.md)'s operator-scoped route,
  including the `X-Operator-Actor` attribution requirement, already fully specified there.

Every route above is `X-Operator-Actor`-required on mutation, per Story 010's mechanism —
applies uniformly across this whole surface, not just the activity route it was introduced
alongside.

---

## Genuinely new routes — no tenant-scoped equivalent exists or could exist

### `GET /operator/tenants` — tenant search/list

- [ ] Paginated, searchable by `slug`/`name` (ADR 0048). The one enumeration capability that
      structurally cannot exist on the tenant-scoped tree — a tenant-scoped caller already knows
      its own `slug`, so nothing there ever needed to *list* tenants at all.
- [ ] Results include `status` — a suspended tenant surfaces here with a visible reactivate
      affordance in `steward`, calling [Story 011](011-tenant-management-and-key-rotation.md)'s
      `PATCH /operator/tenants/{slug}` unchanged.

### `GET /operator/erasure-requests/stuck?olderThanHours=72`

- [ ] Cross-tenant by nature — a tenant-scoped erasure-requests list (Story 008) can only ever
      show one tenant's own stuck requests; an operator needs to see whether this is one
      tenant's problem or one expected service silently failing everywhere at once (ADR 0075).
- [ ] `olderThanHours` is a query-time parameter, not persisted config — an operator adjusts the
      threshold per-query rather than needing an installation-level setting for it.
- [ ] Response includes, per stuck request: `tenant`, `contactId`, `requestedAt`, and which
      specific services in `expectedServices` haven't acknowledged — the diagnostic detail an
      operator actually needs, not just "this one is old."

---

## `email` search on accounts — the one gap ADR 0048 flagged as possibly needed

- [ ] ADR 0048 flagged, without fully confirming, that the account-list endpoint might need an
      `email` filter for the recovery-path search. It already has one —
      [Story 005](005-accounts-roles-and-permissions.md)'s `GET /accounts?email=...`, resolving
      the HMAC internally (ADR 0023) — reused as-is via the operator tree, no gap remains.

---

## Not Covered Here

- `steward`'s own UI for any of this — its own future work.
- The shared operator-token's own distribution/validation mechanics (ADR 0021/0045) — already
  fully specified there; this story only covers what the token unlocks.
