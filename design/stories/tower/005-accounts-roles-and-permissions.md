---
title: "Story 005: Accounts, Roles, and Permissions"
updated: 2026-08-05
status: draft
---
# Story 005 — Accounts, Roles, and Permissions

**Epic:** Identity & Access
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0030](../../adrs/0030-tower-api-surface.md)/
[ADR 0051](../../adrs/0051-web-applications-and-identity-access-screens.md) already
specify.** Per [ADR 0017](../../adrs/0017-account-identity-and-role-model.md),
[ADR 0018](../../adrs/0018-trial-roles-and-keep-boundary.md),
[ADR 0023](../../adrs/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0047](../../adrs/0047-application-and-role-slug-validation.md),
[ADR 0051](../../adrs/0051-web-applications-and-identity-access-screens.md),
[ADR 0069](../../adrs/0069-role-interpretation-is-application-owned.md),
[ADR 0070](../../adrs/0070-self-service-identity-linking.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `account` shape.

---

## Summary

`account`'s own CRUD, plus the two grant mechanisms attached to it — `roles` (opaque,
app-interpreted, ADR 0069) and `permissions` (tower-owned, closed vocabulary). No `POST
/accounts` exists on this surface at all — accounts are created only via login-time resolution
(tower Story 003) or invite acceptance, never directly.

**Read this story's self-action rule carefully — it has a hard exception.** ADR 0070's
self-action principle ("acting on your own `accountId` needs no `permissions` grant") applies to
reading your own account and managing your own identities. It does **not** extend to granting or
revoking your own roles or permissions — see the Roles/Permissions sections below.

---

## Accounts

### `GET /tenants/{tenantSlug}/accounts` — list/search

- [ ] Gated by `accounts:manage`, **except** `?email=...` search specifically also requires
      `contacts:read` — resolving an email to an account necessarily discloses the PII-adjacent
      fact "this email belongs to an account here," the same sensitivity `contacts:read` already
      gates elsewhere (ADR 0030).
- [ ] `email` search resolves the HMAC internally (tenant's `contact-hash-pepper`) and matches
      against `account.contactId` — the caller never sees or handles the hashing scheme (ADR
      0023/0051).
- [ ] Otherwise searches `tenant`/`contactId`/`status` (Story 001's `searchableBy`), paginated
      per ADR 0030's cursor convention.

### `GET /tenants/{tenantSlug}/accounts/{accountId}` — detail

- [ ] Self, or `accounts:manage`. Returns `status`, `emailVerified`, `grantedRoles`,
      `trialRoles`, `trialExpiresAt`, `permissions`, `usage`, `createdAt` — no plaintext contact
      info (that's `contactId`-gated separately, `contacts:read`, per ADR 0051's explicit UI
      principle: an account view doesn't join in PII just because it technically could).

### `PATCH /tenants/{tenantSlug}/accounts/{accountId}`

- [ ] `accounts:manage` — **not** self-actionable, even for your own account. `{ status: "active"
      | "suspended" | "deleted" }` covers suspend/reactivate/business-offboarding in one route,
      no separate action endpoints (ADR 0030). This is a real, deliberate asymmetry worth naming:
      you can read your own account and manage your own identities without a grant, but you
      cannot suspend or delete yourself through this route without `accounts:manage` — self-
      offboarding isn't a designed flow here.
- [ ] `status: "deleted"` is a **business** status — entirely distinct from GDPR erasure, which
      operates on `contact` and can happen independently (ADR 0030, Story 001).

---

## Roles

### `POST /tenants/{tenantSlug}/accounts/{accountId}/roles`

- [ ] **`roles:manage` required — always, including for your own account.** Self-action does
      **not** exempt this route (see Summary). Granting yourself a role is a privilege-relevant
      action, not a data read.
- [ ] Body: `{ name, scope }`. Validated against an **active** `roleDefinition` — constructs the
      exact key (`{tenant}:{name}` or `{tenant}:{appSlug}:{name}`, Story 001) from the requested
      `scope` and rejects if no matching, active `roleDefinition` exists (ADR 0047) — this route
      never grants a role name that hasn't been registered.
- [ ] Always writes to `grantedRoles` (permanent) — this route has no `trialDurationDays`
      parameter and never touches `trialRoles`. Time-boxed grants only ever arrive via invite/
      invite-code redemption or keep's entitlement events (ADR 0018) — an admin manually adding
      a role through this route is, by construction, granting it permanently.

### `DELETE /tenants/{tenantSlug}/accounts/{accountId}/roles/{name}`

- [ ] **`roles:manage` required — always**, same as above; not self-actionable.
- [ ] `scope` disambiguated via query parameter if the same `name` exists at more than one scope
      for this account (ADR 0030) — e.g. `?scope=tenant` vs. `?scope[application]=math`.
- [ ] Checks **both** `grantedRoles` and `trialRoles` for a matching `(name, scope)` and removes
      from whichever array actually has it — a role shouldn't simultaneously exist as both for
      the same `(name, scope)`, so this isn't ambiguous in practice. Removing a `trialRoles`
      entry this way is a targeted early revocation of *that one* role; it does not touch
      `trialExpiresAt` or any other trial role the account might hold (which share one expiry,
      Story 001) — revoking an entire trial batch early is a separate, coarser action (setting
      `trialExpiresAt` to now), not designed as its own endpoint here.

---

## Permissions

### `POST /tenants/{tenantSlug}/accounts/{accountId}/permissions`

- [ ] **`permissions:manage` required — always, including for your own account.** This is the
      single most important instance of the self-action exception in this entire design:
      granting yourself a `permissions` entry is a direct privilege-escalation path if it were
      ever exempted. Never exempt it.
- [ ] Body: `{ grant, scope, maxOutstanding }` (`scope: 'tenant' | { application: '' }`,
      `maxOutstanding` only meaningful for `invite:code:issue` — ADR 0018/0019). `grant` must be
      one of the catalogued values (ADR 0051's permissions table) — rejects anything else outright
      rather than accepting and silently ignoring an unrecognized grant string.

### `DELETE /tenants/{tenantSlug}/accounts/{accountId}/permissions/{grant}`

- [ ] **`permissions:manage` required — always**, same as above; not self-actionable.
- [ ] `scope` disambiguated via query parameter, same shape as role removal, if the same `grant`
      exists at more than one scope.

---

## Not Covered Here

- `/accounts/{accountId}/identities` and `/accounts/{accountId}/change-email` — genuinely
  self-actionable (ADR 0070/0076), covered by their own future story rather than folded in here,
  since they're a meaningfully different concern (identity/contact hygiene, not
  authorization grants).
- `roleDefinition` CRUD (creating the catalog entries this story's role grants validate
  against) — its own future story.
