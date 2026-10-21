---
title: "Story 008: Contacts, Erasure, Data Export, and Email Change"
updated: 2026-08-05
status: draft
---
# Story 008 — Contacts, Erasure, Data Export, and Email Change

**Epic:** Privacy & Compliance
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0030](../../adrs/0030-tower-api-surface.md)/
[ADR 0055](../../adrs/0055-web-privacy-compliance-screens.md)/
[ADR 0056](../../adrs/0056-gdpr-data-export.md)/
[ADR 0076](../../adrs/0076-admin-initiated-email-change.md) already specify.**
Per [ADR 0023](../../adrs/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0024](../../adrs/0024-contact-lifecycle-sync-to-herald.md),
[ADR 0026](../../adrs/0026-erasure-cascade.md),
[ADR 0055](../../adrs/0055-web-privacy-compliance-screens.md),
[ADR 0056](../../adrs/0056-gdpr-data-export.md),
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md),
[ADR 0075](../../adrs/0075-stuck-erasure-request-monitoring.md),
[ADR 0076](../../adrs/0076-admin-initiated-email-change.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `erasureRequest`/`exportRequest`
shapes and `contact`'s Postgres-row exception.

---

## Contacts

`contact` is a plain, mutable, **deletable** Postgres row — the one deliberate exception to
"nothing is ever physically deleted" (Story 001), because GDPR erasure needs a real hard delete.
`id` is computed as `HMAC-SHA256(tenantPepper, tenant + ':' + normalizedEmail)` — deterministic,
so a lookup is always a direct key computation, never a search.

### `GET /tenants/{tenantSlug}/contacts?email=...` — single-result lookup only

- [ ] Gated by `contacts:read`. Computes the HMAC internally using the tenant's
      `contact-hash-pepper` and looks up directly — the caller never handles or sees the hashing
      scheme.
- [ ] **Deliberately not a browse/list endpoint** — no `GET /contacts` with no query, ever.
      Bulk access to plaintext PII is a materially bigger exposure surface than the actual use
      case ("someone gave us an email, look them up"), which this design never needs (ADR 0030).

### `GET /tenants/{tenantSlug}/contacts/{contactId}` — detail

- [ ] Gated by `contacts:read`. Returns plaintext `email`/`name` plus a linked-account preview
      (`status`, `grantedRoles`/`trialRoles`, `createdAt` — resolved via `account.contactId`,
      one plain lookup, not a search).

### `PATCH /tenants/{tenantSlug}/contacts/{contactId}` — `name` only

- [ ] Gated by `contacts:read` (not a separate grant — a correctable, non-cascading field edit
      doesn't need its own permission the way erasure does, ADR 0051's catalog correction).
      `email` is never accepted here — immutable outside the dedicated change-email flow, below.

### `DELETE /tenants/{tenantSlug}/contacts/{contactId}` — the erasure trigger

- [ ] **Gated by `contacts:erase`, not `contacts:read`** (ADR 0051's catalog correction, found
      while grounding this story — an irreversible, cross-service cascade is a materially
      different consequence than a read).
- [ ] Deletes the `contact` row outright (a real Postgres `DELETE`, not a status flip — the one
      actor in this design where that's correct).
- [ ] Creates an `erasureRequest` (`status: "pending"`, `acknowledgedBy: []`, `requestedAt: now`)
      and publishes `contact.purged { tenant, contactId }` to the fixed fan-out (ADR 0026) — every
      expected service (herald, keep, ...) binds its own queue independently.
- [ ] **`account` and `identity` are untouched.** `account.contactId` becomes a dangling
      reference to a now-deleted row — expected, not a bug. The account keeps functioning exactly
      as before (still authenticates via its existing `identity` records, still holds its
      `grantedRoles`/`permissions`) — erasure removes retrievable PII, it does not revoke access
      or delete the account. A subsequent login for the same real person creates a fresh `contact`
      row (same deterministic HMAC, since they'll use the same email) with no memory of the old
      one's `name`.

### Acknowledgment consumption

- [ ] Tower runs a RabbitMQ consumer for `contact.purge.acknowledged { tenant, contactId,
      service }` — each receipt issues a command against the matching `erasureRequest` appending
      `service` to `acknowledgedBy`. The same "external event triggers an internal command"
      shape as `account.usage-updated` (Story 001), not a new pattern.
- [ ] Once `acknowledgedBy` contains every service on tower's own fixed, hardcoded expected-list
      (not a config value — a real constant that must be deliberately extended whenever a new
      PII-holding service joins, ADR 0026), the command flips `status: "completed"`.
- [ ] No timeout, ever — a request missing one acknowledgment stays `"pending"` indefinitely by
      design (ADR 0026). Visibility into that state is [ADR 0075](../../adrs/0075-stuck-erasure-request-monitoring.md)'s
      concern (a `web` client-side staleness flag, a `steward` cross-tenant view), not this
      story's — nothing here changes to support it beyond the data already being readable.

---

## Erasure Requests — read-only, compliance verification

- [ ] `GET /tenants/{tenantSlug}/erasure-requests` — gated by `erasure-requests:read`
      (deliberately narrower than `contacts:read`/`contacts:erase` — these records carry no
      PII). Paginated, filterable by `status`/date range.
- [ ] `GET /tenants/{tenantSlug}/erasure-requests/{contactId}` — same gate. Response includes
      `expectedServices` **computed at read time from tower's fixed constant**, not persisted per
      record — so a caller diffs it against `acknowledgedBy` rather than needing its own
      hardcoded copy of the service list (ADR 0055).

---

## Data Export

### `GET /tenants/{tenantSlug}/contacts/{contactId}/export` — admin-triggered

- [ ] Gated by `contacts:export` — distinct from and broader than `contacts:read` (ADR 0056).
- [ ] Response:

```
{
  contact: { email: '', name: '' },
  account: { accountId: '', status: '', grantedRoles: [], trialRoles: [], permissions: [], createdAt: '' },
  identities: [ { idp: '' } ],       // display-facing — idp names only
  identityHashes: [''],               // separate field, for web's own chronicle correlation only
  invitesReceived: [ /* summary fields */ ],
  inviteCodesIssued: [ /* summary fields */ ],
}
```

- [ ] `identities`/`identityHashes` resolved via `find('identity', [{ accountId }])` — this is
      exactly why `identity.searchableBy` gained `accountId` (Story 001/ADR 0056); without it
      this query wouldn't be possible at all.
- [ ] `invitesReceived` via `find('invite', [{ contactId }])`; `inviteCodesIssued` via
      `find('inviteCode', [{ issuedBy: accountId }])` — both already-existing `searchableBy`
      fields (Story 001), no new indexing needed.
- [ ] **Known, honestly-named limitation carried forward from ADR 0056, not solved here**: this
      export cannot answer "which invite codes or coupons did this person redeem" — neither
      `inviteCode` nor keep's `coupon` tracks per-redeemer identity, only a bare
      `redemptionCount`. Omitted, not silently faked.
- [ ] This route returns only tower's own slice — `web` is what assembles the full cross-service
      export (calling this, keep's, herald's, and chronicle's own export endpoints in parallel)
      and handles partial-failure marking across all of them (ADR 0056). This story has no
      partial-failure concept of its own — it either succeeds or it doesn't, like any other
      single-service read.
- [ ] Creates an `exportRequest` audit record (`{ tenant, contactId, requestedBy, requestedAt }`)
      — lightweight, no `acknowledgedBy`/`expectedServices`, since export is synchronous with
      nothing async to track (Story 001).

### `GET /me/export` — self-service

- [ ] Resolves the caller's own `contactId` from the forwarded internal JWT (via `account`,
      resolved from `accountId` — no special permission needed, acting on your own data needs
      only being authenticated as yourself, ADR 0056). Same response shape and behavior as the
      admin route above, reached through [ADR 0071](../../adrs/0071-self-service-widget-data-access.md)'s
      `/_authstar/me/export` proxy (which fans out to `web`, not directly to this route — `web`
      still owns the multi-service assembly even for the self-service case).

---

## Email Change

### `POST /tenants/{tenantSlug}/accounts/{accountId}/change-email`

- [ ] Gated by `accounts:manage` (ADR 0076) — admin-triggered in this pass; not self-actionable
      (consistent with Story 005's posture on `accounts:manage` generally).
- [ ] Body: `{ newEmail }`. Computes the new email's `contactId` hash, finds-or-creates the
      `contact` row for it (same deterministic lookup invite acceptance already uses), repoints
      `account.contactId`, and emits `account.contact_changed` (old `contactId`, new `contactId`
      — never plaintext).
- [ ] Publishes `herald.contact.migrated { tenant, oldContactId, newContactId }` — the exact
      message [ADR 0024](../../adrs/0024-contact-lifecycle-sync-to-herald.md) already
      defined for this purpose (originally for pepper rotation; this is its first real trigger
      for the email-change case specifically). Herald's handling of it is extended (ADR 0076) to
      carry forward `suppression` records, not just `optOut`.
- [ ] The **old** `contact` row is left as-is, not cleaned up — a named, accepted trade-off (ADR
      0076): it may still be referenced by historical `communication`/`invite` records, and
      email-change isn't erasure.

---

## Not Covered Here

- Keep's, herald's, and chronicle's own export endpoints, and `web`'s assembly/partial-failure
  logic across all of them — each service's own concern.
- Herald's `contact.migrated`/`contact.purged` **handling** (as opposed to tower's publishing of
  them) — herald's own story, not yet written.
