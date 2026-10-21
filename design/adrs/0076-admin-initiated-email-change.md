---
id: ADR-0076
title: Admin-Initiated Email Change
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0076: Admin-Initiated Email Change

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** tower, herald, web
- **Resolves the flagged gap in:** [ADR 0055](0055-web-privacy-compliance-screens.md)

## Context

`contact.email` is immutable by design — ADR 0023 already named the correct mechanism
conceptually ("changing email repoints `contactId`... a new (or reused) contact record is
created for the new email's hash, and `account.contactId` is repointed to it... producing the
free, legitimately auditable `account.contact_changed` event") but never built it: no route,
request shape, or UI exists anywhere. ADR 0023 also flagged a real dependency this flow must
satisfy: opt-out status doesn't automatically carry forward across a repoint, "or a real
anti-spam risk results."

## Decision

`POST /tenants/{tenantSlug}/accounts/{accountId}/change-email` — deliberately not a `PATCH`.

### `POST /tenants/{tenantSlug}/accounts/{accountId}/change-email` — deliberately not a `PATCH`

Body: `{ newEmail }`. This breaks ADR 0030's own "no verb segments, state changes are field-level
`PATCH`" convention on purpose: a `PATCH` describes a partial update to *the same* resource, but
this operation produces a **different** `contact` resource (a new or reused `contactId`) and
repoints a reference on `account` — not a field-level change to the old contact record at all.
Modeling it as `PATCH /contacts/{contactId}` would be actively misleading (which resource is
even being addressed once the id changes?). Scoped to `account`, not `contact`, since
`account.contactId` is what's actually being repointed — the same reasoning ADR 0023 already
gave. Gated by the existing `accounts:manage` permission (ADR 0051) — no new grant needed, this
is squarely another account-lifecycle admin action.

### What it does — the mechanism ADR 0023/0024 already designed, now actually wired to a caller

Discovering this during design: ADR 0024 already built the exact cross-service carry-forward
mechanism this needed — `herald.contact.migrated` (`{ tenant, oldContactId, newContactId }`),
"published whenever a `contactId` changes but the underlying person continues to exist: an email
change... or a pepper rotation." It's existed since ADR 0024; nothing has ever actually
triggered it for the email-change case, because nothing built the email-change flow itself
until now. This route is that trigger, not a new mechanism:

1. Compute the new email's `contactId` hash (same deterministic HMAC, same tenant pepper).
2. Find-or-create the `contact` record for that hash — reusing the existing deterministic
   lookup (ADR 0023: "inviting an already-known email naturally resolves to the same contact
   record... no explicit linking step required" — the identical mechanism, just triggered here
   instead of by invite acceptance).
3. Repoint `account.contactId` to the new/reused `contactId`; emit `account.contact_changed`
   (tower's own internal audit event on the `account` actor — old `contactId`, new `contactId`,
   never plaintext).
4. Publish `herald.contact.migrated` — the existing ADR 0024 message, unchanged in shape.

### Suppression carry-forward extends `herald.contact.migrated`'s existing handling

ADR 0024 only carried forward `optOut` because `suppression` ([ADR 0074](0074-herald-bounce-complaint-and-suppression.md))
didn't exist yet when it was written. Herald's handling of `contact.migrated` is extended here
to also copy `suppression` records from `oldContactId` to `newContactId` — otherwise a repoint
would silently re-enable sending to an address that was suppressed for good reason, just because
it got relabeled to a new `contactId`.

### `web` — one new action on the existing contact detail view

"Change email" alongside the existing `name` edit and erasure actions (ADR 0055) — admin enters
the new address, confirms, calls the route above. No new screen, no new IA.

### Self-service is a compatible future addition, not designed here

ADR 0055 originally suggested self-service was the more natural fit; this ADR builds the
admin-triggered path specifically since that's the named gap. A future self-service "change my
email" flow (reached from an eventual account-settings surface, not designed here) would call
the *same* underlying repoint mechanism with the caller acting on their own `accountId` — no
architectural conflict, just a different, not-yet-built entry point.

### Named, accepted limitation: the old `contact` record isn't cleaned up

After a repoint, the old `contact` row has no `account` referencing it anymore but isn't erased
— email change isn't erasure, and inventing an automatic cleanup here would risk deleting a
`contact` record still meaningfully referenced by history (past `communication`/`invite`
records keyed to the old `contactId`, ADR 0056's export). Left as-is, named explicitly rather
than silently ignored — a real but low-severity accumulation of orphaned rows, not a
correctness or compliance issue.

## Consequences

- New tower route (`POST /accounts/{accountId}/change-email`), reusing `accounts:manage`.
- Tower actually publishes `herald.contact.migrated` (ADR 0024) for the first time — it existed
  on paper with no caller until now.
- Herald's existing `contact.migrated` handling is extended to also carry forward `suppression`,
  not just `optOut`.
- `web`'s contact detail view gains one new action.
- Orphaned old `contact` rows are a named, accepted trade-off, not solved here.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0024](0024-contact-lifecycle-sync-to-herald.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0055](0055-web-privacy-compliance-screens.md), [ADR 0056](0056-gdpr-data-export.md), [ADR 0074](0074-herald-bounce-complaint-and-suppression.md)
