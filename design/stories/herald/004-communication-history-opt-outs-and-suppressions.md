---
title: "Story 004: Communication History, Opt-Outs, and Suppressions"
updated: 2026-08-05
status: draft
---
# Story 004 — Communication History, Opt-Outs, and Suppressions

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — herald's side of the routes [ADR 0034](../../adrs/0034-herald-api-surface.md)/
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md) already specify.**
Per [ADR 0024](../../adrs/0024-contact-lifecycle-sync-to-herald.md),
[ADR 0025](../../adrs/0025-versioned-templates-and-encrypted-payloads.md),
[ADR 0053](../../adrs/0053-lifecycle-status-consolidation.md),
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `communication`/`optOut`/`suppression`
shapes, [Story 002](002-send-worker-and-retry.md)'s manual-retry route (already specified there,
listed here only for completeness of this story's route group).

---

## Communication History

### `GET /tenants/{tenantSlug}/communications` — list

- [ ] Cursor-paginated, filterable by `contactId`/`type`/`status`/date range (ADR 0034). Returns
      minimal audit fields only — `tenant`, `application`, `contactId` (hash), `category`,
      `type`, `title`, `status`, timestamps. **Never `encryptedPayload`, ever, on this route** —
      list responses don't leak ciphertext, even though it's not plaintext.

### `GET /tenants/{tenantSlug}/communications/{id}` — detail

- [ ] Same minimal fields as the list — this route is **not** where content is viewed. `{id}` is
      the bare `idempotencyKey`, constructed into the full `{tenantSlug}:{idempotencyKey}` key
      internally (Story 001/ADR 0084's composite-key correction), same route-parameter pattern
      used throughout this design.

### `GET /tenants/{tenantSlug}/communications/{id}/render` — on-demand decrypt + render

- [ ] Narrowly permissioned, same sensitivity posture as tower's `contacts:read` (ADR 0025) —
      viewing rendered content is a real PII exposure, not a routine admin action. Decrypts
      `encryptedPayload` transiently (the record's own `payloadKeyVersion` selects the private
      key generation, Story 001/0081) and re-renders using the **template version pinned on the
      record**, not the current one — reconstructs exactly what was actually sent, at the time it
      was sent, even if the template has since been edited. If `payloadPurgedAt` is set, the
      payload is gone — this route returns the minimal audit fields with a clear "payload purged
      per retention policy" indicator, not an error masquerading as missing data.

### `PATCH /tenants/{tenantSlug}/communications/{id}` — manual retry

- [ ] Already fully specified in [Story 002](002-send-worker-and-retry.md) — listed here only so
      this story's route group is complete, not re-derived.

---

## Opt-Outs

### `GET /tenants/{tenantSlug}/opt-outs/{contactId}` — current opted-out categories

- [ ] Straightforward read of `optOut.optedOutCategories` (Story 001).

### `POST /tenants/{tenantSlug}/opt-outs/{contactId}/categories` — support-initiated opt-out

- [ ] Body: `{ category }`. The admin/support-side entry point for "a recipient called and asked
      to be removed from marketing" — the self-service path is the public `/unsubscribe` flow
      (Story 002), not this route; this one exists for the case where the recipient can't or
      doesn't use their own unsubscribe link.

### `DELETE /tenants/{tenantSlug}/opt-outs/{contactId}/categories/{category}` — re-subscribe

- [ ] A **collection membership operation, not a lifecycle status change** — confirmed
      explicitly out of scope for ADR 0053's `PATCH`-alias pattern (ADR 0053/Story 001). A real
      `DELETE`, not a soft alias, since there's no historical value in remembering "this category
      used to be opted out" once legitimately re-subscribed.

---

## Suppressions

### `GET /tenants/{tenantSlug}/suppressions` — list

- [ ] Gated by `suppressions:manage`. Filterable by `reason`/date range (Story 001).

### `POST /tenants/{tenantSlug}/suppressions` — manual add

- [ ] Body: `{ contactId, reason: "manual" }` — the deliberate-suppression case (e.g. a support-
      handled "please stop emailing me entirely" request that isn't well-modeled as a per-category
      opt-out, since suppression is blanket by design, ADR 0074).

### `DELETE /tenants/{tenantSlug}/suppressions/{contactId}` — admin override

- [ ] Removes the suppression outright — a bounce was transient-but-misclassified, or a
      complaint was mistaken. Real `DELETE`, same reasoning as opt-out category removal above:
      once legitimately overridden, there's no audit value in keeping the row.

---

## Not Covered Here

- The SES/SNS webhook that actually creates `suppression` rows from bounce/complaint
  notifications — a future story, already specified at the ADR level (ADR 0074).
- Contact lifecycle sync (`herald.contact.migrated`/`herald.contact.purged` handling) that keeps
  `optOut`/`suppression` records attached to the right `contactId` across email changes and
  erasure — already specified (ADR 0024/0076), a future story gives it route-adjacent treatment
  if any is needed beyond the consumer logic itself.
