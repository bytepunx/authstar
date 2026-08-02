# ADR 0055: `web`'s Privacy & Compliance Screens

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web, tower
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)

## Context

Designing the Contacts and Erasure Requests screens against tower's exact shapes (ADR 0023/
0026/0030) surfaced a blocking discoverability gap, several concrete safety/usability
improvements to the erasure flow, and one significant, previously-unaddressed gap in GDPR
coverage overall.

## Decision

### Contacts — finding one, safely

**New route**: `GET /tenants/{tenantSlug}/contacts?email=...` — single-result lookup, tower
computes the HMAC and resolves internally (ADR 0023), the same fix already applied to accounts
in ADR 0051. Without this, an admin has no path from a human-provided email to the opaque
`contactId` needed for every other contact operation.

**Deliberately not a browse/list endpoint.** `contact` holds direct plaintext PII and is already
narrowly permissioned (ADR 0030) precisely because bulk access to it is a bigger exposure
surface than the actual use case needs — every real scenario starts from a specific email
someone provided, never "let me browse everyone's personal info." Exact lookup only, by design.

**Detail view shows a linked-account preview** — `contactId`'s corresponding `account` (status,
roles, tenure), resolved via the same `account.contactId` field ADR 0051 already made
searchable. Free to add (tower can do this join internally) and directly serves the "know what
you're about to erase before you commit" goal below.

**`name` becomes `PATCH`-able; `email` stays immutable.** Checking ADR 0023's own hashing
scheme: only `email` feeds the HMAC that produces `contactId` — `name` never did, so editing it
carries none of the repoint/migration complexity a changed email would. A small, low-risk
usability win (support fixing a typo'd display name) that costs nothing given the underlying
shape already supports it safely.

### Erasure — safer to trigger, easier to verify, easier to audit

**Confirmation step required before `DELETE`** on `/contacts/{contactId}` — given the linked-
account preview above shows real blast radius (an active account, tenure, roles) before the
irreversible action, the UI should require typing the email back to confirm, the standard
pattern for a destructive action this consequential. `identity`/`account` become permanently
orphaned once `contactId` is gone (ADR 0023) — there's no undo.

**The confirmation flow doesn't end at the `DELETE` response** — it transitions directly into
watching that erasure request's status (polling or live update until `pending` → `completed`).
An admin telling their own legal/compliance team "yes, this was erased" wants to *see* it
confirmed, not trust a bare `204`.

**New route**: `GET /tenants/{tenantSlug}/erasure-requests` (list, paginated, filterable by
status/date range) — ADR 0026 only ever specified single-lookup by known `contactId`, but the
record's *stated purpose* is "proof of compliance," which requires being able to produce a set
of them for an audit period, not spot-check one at a time. `erasureRequest` carries no PII
(ADR 0026), so a list endpoint here carries none of the exposure-minimization concern that ruled
out the same idea for `contact` above.

**Erasure-request responses gain `expectedServices`** alongside the existing `acknowledgedBy` —
tower's own fixed list (ADR 0026) is the single source of truth for "what should eventually
acknowledge this"; the UI diffs the two rather than needing its own hardcoded copy of that list.

**New, narrower permission**: `erasure-requests:read`, distinct from `contacts:read`. Reviewing
erasure completion records (no PII) is a meaningfully less sensitive activity than viewing raw
contact PII, and a compliance-focused staff member may legitimately need the former without the
latter — the same least-privilege precision already applied elsewhere (`roles:manage` vs.
`permissions:manage`, ADR 0051). Added to that ADR's consolidated permissions catalog.

## Explicitly Out of Scope

- **GDPR right of access/portability (Article 15/20)** — **resolved in
  [ADR 0056](0056-gdpr-data-export.md)/[ADR 0057](0057-web-data-export-screen.md)**, addressed
  as its own dedicated pass immediately following this one, per the plan stated here.
- **Monitoring/alerting on a "stuck" erasure request** (a service failing to acknowledge) — an
  operational/observability concern, not a `web` screen-design one. Flagged, not designed.
- **Admin-initiated email changes on a user's behalf** — `contact.email`'s immutability is by
  design (ADR 0023); a real "change my email" flow is a separate, not-yet-designed capability,
  most naturally user-self-service rather than admin-triggered. Noted as adjacent, not solved
  here.

## Consequences

- Tower gains the contacts email-search route, `contact.name` `PATCH` support, the
  erasure-requests list route, and `expectedServices` on erasure-request responses.
- ADR 0051's permissions catalog gains `erasure-requests:read`.
- The GDPR right-of-access gap is now a named, tracked item rather than an implicit omission.

## Related

- [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0040](0040-keep-erasure-response.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md)
