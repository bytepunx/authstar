---
title: "Story 009: Self-Service Identities and `/me/*` Routes"
updated: 2026-08-05
status: draft
---
# Story 009 — Self-Service Identities and `/me/*` Routes

**Epic:** Self-Service
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0070](../../adrs/0070-self-service-identity-linking.md)/
[ADR 0071](../../adrs/0071-self-service-widget-data-access.md) already specify.**
Per [ADR 0019](../../adrs/0019-invite-codes.md),
[ADR 0030](../../adrs/0030-tower-api-surface.md),
[ADR 0043](../../adrs/0043-application-reported-usage-metering.md),
[ADR 0070](../../adrs/0070-self-service-identity-linking.md),
[ADR 0071](../../adrs/0071-self-service-widget-data-access.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `identity`/`account` shapes,
[Story 007](007-invites-and-invite-codes.md)'s `inviteCode` creation validation (reused
unchanged by `/me/invite-codes`).

---

## Linking — the portcullis-mTLS commit endpoint

### `POST /identity-links`

- [ ] SPIFFE mTLS only — same trust boundary as `/enrich`/`/identities/resolve` (Stories
      002/003); not on the tenant-scoped or operator route trees at all.
- [ ] Body: `{ tenant, accountId, identityHash, idp }`.
- [ ] `identityHash` unclaimed → create the `identity` actor (Story 001's shape) with the
      supplied `accountId`.
- [ ] `identityHash` already resolves to this same `accountId` → idempotent success (a harmless
      re-link, e.g. re-authenticating the same provider after a token refresh).
- [ ] `identityHash` already resolves to a **different** `accountId` → `409 Conflict`. No
      account-merge behavior of any kind — a substantially harder, explicitly out-of-scope
      problem (ADR 0070).

---

## Admin-addressable identities routes

### `GET /tenants/{tenantSlug}/accounts/{accountId}/identities`

- [ ] Self, or `accounts:manage`. Returns `{ idp }` per linked identity — never the raw
      `identityHash`, which is a meaningless internal correlation artifact to display, and never
      any subject identifier, which tower doesn't have.

### `DELETE /tenants/{tenantSlug}/accounts/{accountId}/identities/{identityHash}`

- [ ] Self, or `accounts:manage`. **Two independent safeguards, either one rejects the write:**
  - [ ] **Last identity**: refuses if the account would be left with zero linked identities —
        an account must always retain at least one way to sign back in (ADR 0070).
  - [ ] **Currently-active identity**: refuses unconditionally if `{identityHash}` matches the
        caller's own `identityHash` claim (present on every forwarded internal JWT regardless of
        outcome, Story 010's clarification) — **regardless of how many other identities remain**.
        This check is independent of the first: it can reject even when the account has several
        other identities, because the problem isn't "would this orphan the account," it's
        "you're asking to remove the very access you're using to ask" (ADR 0070's correction).
        For a genuine cross-account admin action, this check is naturally a no-op — the admin's
        own `identityHash` can never coincidentally equal a *different* account's identity.

---

## `/me/*` — self-resolving, no `accountId`/`tenantSlug` in the URL

Reached exclusively through portcullis's `/_authstar/me/*` proxy family (ADR 0071) — never
called by a browser directly. Every route below resolves identity entirely from the forwarded
internal JWT; none of them accept or trust a client-supplied account identifier.

### `GET /me/account`

```
{ status, grantedRoles, trialRoles, permissions, contactId, email, name, usage }
```

- [ ] `email`/`name` come from the same plaintext `contact` join `contacts:read` uses for admin
      access (Story 008) — no gate needed here, since acting on your own data never requires a
      `permissions` grant (ADR 0070's self-action principle, and this is the read side of it,
      not the roles/permissions-grant side Story 005 excludes).
- [ ] `usage` is `account.usage` (Story 001), unfiltered by application — unlike the internal
      JWT's own `usage` claim (which portcullis already scopes to one application, Story 010),
      this route has no single application context to filter by, so it returns everything.

### `GET`/`DELETE /me/identities[/{identityHash}]`

- [ ] Thin aliases over the admin-addressable routes above, with `accountId` resolved from the
      JWT instead of a URL segment — same underlying handler, same two `DELETE` safeguards,
      unchanged.

### `GET`/`POST /me/invite-codes`

- [ ] `GET` filters to `issuedBy = caller's own accountId` (`inviteCode.searchableBy`, Story
      001/007 — already indexed, no new field needed).
- [ ] `POST` reuses [Story 007](007-invites-and-invite-codes.md)'s creation validation
      unchanged (`roleDefinition` check, no `permissions` field, composite key construction) —
      **still gated by `invite:code:issue`, self-action does *not* exempt it.** Issuing a code is
      an action with real system consequences (a redeemable grant now exists), not a read of
      one's own data — the same reasoning Story 005 applied to role/permission grants, restated
      here because it's easy to assume "it's `/me/*`, so it must be exempt" when it isn't.

---

## Not Covered Here

- The confirmation-flow mechanics around linking (`/_authstar/link/confirm`, the
  `oauth2-pending-link` cookie) — entirely portcullis's concern
  ([Story 024](../proxy/024-self-service-identity-linking.md)), not tower's; this story only
  covers the one commit call portcullis makes once the user has confirmed.
- `/me/subscription` and `/me/export` — keep's and web's own routes respectively (ADR 0071),
  not tower's.
