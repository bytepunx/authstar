---
id: ADR-0074
title: Bounce/Complaint Handling and Suppression Lists
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0074: Bounce/Complaint Handling and Suppression Lists

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** herald, portcullis, web
- **Resolves the deferred item in:** [ADR 0022](0022-herald-communications-service.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md)

## Context

`communication.status` has carried `bounced` and `suppressed` in its enum since ADR 0025 — both
entirely unpopulated. ADR 0032 named the reason precisely: bounce/complaint mechanics are
**adapter-dependent**, and SMTP (herald's first, always-available adapter) has no standard
webhook mechanism at all — getting bounce signal from SMTP would need inbound-email processing,
"a materially bigger feature than anything else here." That finding still holds and isn't
reopened. This ADR covers what's actually tractable: **API-based adapters** (SES, named as the
next adapter after SMTP, ADR 0032), which do have a standard provider-originated notification
mechanism.

## Decision

Scope: API-based adapters only — SMTP bounce/complaint handling stays explicitly out of scope.

### Scope: API-based adapters only — SMTP bounce/complaint handling stays explicitly out of scope

Consistent with ADR 0032's own boundary. A tenant on the SMTP adapter simply never populates
`bounced`/`suppressed`/complaint data — no regression, no half-built feature, just the same gap
that already existed, now solved for the adapters where it's actually solvable without a much
bigger inbound-email subsystem.

### A new reserved webhook path, mirroring keep's Stripe webhook exactly

`POST /_authstar/webhooks/ses` — a portcullis reserved path, registered against the tenant's
`_admin` application's host (stable, always present, per ADR 0044 — identical reasoning to why
`/_authstar/webhooks/stripe` lives there, ADR 0041), resolved via normal `Host`-based
tenant/application resolution (Story 013), proxied straight to `herald` with **no** session/JWT
check of its own. The provider's own notification signature (SNS message signing, in SES's
case) is the actual authentication — the same posture as Stripe's webhook secret, just a
different provider's signing scheme.

### `sending-config` gains a `webhookSecret` field

Extends the existing per-tenant singleton (ADR 0032/0034) rather than a new config surface —
`PATCH /tenants/{tenantSlug}/sending-config` now also accepts a `webhookSecret` (write-only,
same discipline as `credential`), used by herald to verify inbound notification signatures for
that tenant specifically. Delivered to herald's own bundle via the same mechanism ADR 0052
already established for this route's other secrets.

### `communication` gains two new fields, correlating inbound notifications back to a send

- **`providerMessageId`** — captured from the adapter's `send()` response (ADR 0032's interface
  already returns one; it was simply never persisted) and stored on the `communication` record.
  This is what a bounce/complaint notification carries back, and the only way to correlate one
  to the record it's about.
- **`complainedAt`** — nullable timestamp, a distinct axis from `status`, same precedent ADR
  0029 already set with `payloadPurgedAt` ("`status` continues to describe send-lifecycle
  outcome... a distinct axis"). A complaint happens *after* successful delivery — the
  communication genuinely was `delivered`; overwriting that with some new status would be
  factually wrong. A hard bounce, by contrast, **is** a delivery outcome, so it uses the
  existing `status: "bounced"` value directly — no new field needed there, just the missing
  code path to set it.

### Hard bounces and complaints both suppress; soft bounces don't

- **Hard bounce** (permanent failure — invalid address, domain doesn't exist): sets
  `communication.status = "bounced"` and adds the contact to a new suppression record (below).
- **Soft bounce** (transient — mailbox full, temporary provider issue): handled entirely by
  ADR 0033's existing transient/permanent retry classification; does **not** suppress future
  sends, since the address itself isn't known-bad.
- **Complaint** (recipient marked as spam): sets `communication.complainedAt` and adds the
  contact to suppression — arguably a *stronger* signal to stop than a bounce, since ISPs
  actively penalize continued sending to complainers.

### A new `suppression` record — deliberately distinct from `optOut`

```ts
{ tenant: '', contactId: '', reason: 'hard-bounce' | 'complaint' | 'manual', createdAt: '' }
```

`optOut` (ADR 0022/0023/0024) is **category-scoped**, **recipient-initiated**, and exists to
satisfy CAN-SPAM consent law. Suppression is **blanket** (every category — there's no legitimate
reason to keep emailing an address that hard-bounces or complained, regardless of what category
the next message would be), **system-or-admin-initiated**, and exists for deliverability
protection, not consent. Conflating the two would be wrong on both axes; they stay separate
mechanisms sharing only the `contactId` key.

### Send worker checks suppression before every attempt — reusing the existing `status: "suppressed"` outcome

`status: "suppressed"` already exists and is already populated for the opt-out case (ADR 0022:
a `marketing` message to an opted-out recipient is "suppressed... not sent"). This adds a
**second** cause that produces the exact same outcome: alongside the existing category-scoped
opt-out check, the send worker now also checks the blanket suppression list first. Either check
failing produces the same `status: "suppressed"`, never reaching the adapter — the distinction
(opted-out vs. deliverability-suppressed) lives in *why* it was suppressed, not a different
status value, since from the recipient's perspective the outcome is identical: no message sent.
The `bounced` value, by contrast, genuinely was unpopulated until this ADR — that one **is** a
new code path, not a reused one.

### New herald routes and permission

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/suppressions` | `GET` | Filterable by `reason`, date range |
| `/tenants/{tenantSlug}/suppressions` | `POST` | Manual add — `{ contactId, reason: "manual" }`, e.g. a support-handled "please stop emailing me entirely" request that isn't well-modeled as a per-category opt-out |
| `/tenants/{tenantSlug}/suppressions/{contactId}` | `DELETE` | Admin override — a bounce was transient-but-misclassified, or a complaint was mistaken; re-enables sending |

Gated by a new `suppressions:manage` permission — one grant covering read and write, the same
posture as `opt-outs:manage` (the suppression list carries no plaintext PII, only hashed
`contactId`s, so it doesn't need the narrower read/write split `contacts:read`/`contacts:export`
have for that reason).

### `web` — extends the existing Communications section, no new IA

The Suppression List becomes another view alongside Opt-outs (ADR 0054), with the manual
add/remove actions above — not designed further here, consistent with how ADR 0054 treats every
other sub-section in that space.

## Consequences

- New portcullis reserved path and story.
- `sending-config` gains `webhookSecret`; `communication` gains `providerMessageId`/
  `complainedAt`.
- New herald actor (`suppression`), three new routes, one new permission.
- Send worker gains a pre-send suppression check.
- SMTP-adapter tenants remain unaffected — no bounce/complaint signal for them, unchanged from
  today, named explicitly rather than silently implied as "solved for everyone."

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0029](0029-herald-payload-retention.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0033](0033-herald-send-worker-and-retry.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0054](0054-web-billing-and-communications-screens.md)
