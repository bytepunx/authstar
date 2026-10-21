---
title: "Story 005: Bounce/Complaint Webhook, Sending Config, Key Rotation, and Activity"
updated: 2026-08-05
status: draft
---
# Story 005 — Bounce/Complaint Webhook, Sending Config, Key Rotation, and Activity

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — herald's side of the routes [ADR 0034](../../adrs/0034-herald-api-surface.md)/
[ADR 0045](../../adrs/0045-steward-operator-console.md)/
[ADR 0052](../../adrs/0052-keep-herald-own-signet-access.md)/
[ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md)/
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md)/
[ADR 0081](../../adrs/0081-herald-key-rotation.md) already specify.**
**Depends on:** [Story 001](001-actor-definitions.md)'s `sendingConfig`/`communication`/
`suppression` shapes, [tower Story 010](../tower/010-activity-feed.md)'s event-stream-construction
approach (reused here).

---

## Bounce/Complaint Webhook

### `POST /_authstar/webhooks/ses`

- [ ] A **portcullis reserved path**, mirroring keep's Stripe webhook exactly — registered
      against the tenant's `_admin` application's stable host, resolved via normal `Host`-based
      tenant/application resolution, proxied straight to herald with **no session/JWT check**
      (ADR 0074). The provider's own notification signature (SNS message signing, for SES) is
      the actual authentication.
- [ ] Herald verifies the signature against `sendingConfig.webhookSecret` (Story 001, the
      tenant's own key) — a mismatch is rejected outright, logged, never processed.
- [ ] **Scoped to API-based adapters only** — an SMTP-adapter tenant has no `webhookSecret`
      configured (ADR 0074), and this route naturally has nothing meaningful to verify for that
      tenant. Not special-cased; herald's own verification simply fails closed for a tenant with
      no secret set, same as any other signature mismatch.
- [ ] Correlates the notification to a `communication` record via `providerMessageId` (Story
      001) — the field the send worker (Story 002) populated at successful-send time.
- [ ] **Hard bounce** → `communication.status: "bounced"` (the value that's sat in the enum
      unpopulated since ADR 0025) + creates a `suppression` row (`reason: "hard-bounce"`).
- [ ] **Soft bounce** → no `suppression` row — handled entirely by the send worker's existing
      transient-retry classification (Story 002); the address isn't known-bad, just temporarily
      unreachable.
- [ ] **Complaint** → `communication.complainedAt` set (a distinct axis from `status`, Story
      001 — the send genuinely was `"delivered"`/`"sent"`; a complaint doesn't retroactively
      un-happen it) + creates a `suppression` row (`reason: "complaint"`).

---

## Sending Configuration

### `GET`/`PATCH /tenants/{tenantSlug}/sending-config`

- [ ] Gated by `sending-config:manage`. `GET` never returns `credential`/`webhookSecret`
      (write-only, Story 001). `PATCH` accepts `provider`/`fromAddress`/`fromName`/`replyTo`/
      `physicalAddress` freely, and `credential`/`webhookSecret` to set/rotate either — pushed
      directly to herald's own signet bundle (Story 001/ADR 0052), never through tower.

---

## Key Rotation

### `POST /operator/rotate-keys`

- [ ] Bearer-token operator auth — herald's **only** operator route, the one deliberate
      exception to "no operator tier" (ADR 0034/0081). No `tenantSlug` in the path — these keys
      are installation-wide, not per-tenant.
- [ ] Body: `{ keys: ('payload-encryption' | 'unsubscribe-signing')[] }` — already fully
      specified in [Story 001](001-actor-definitions.md)'s key-rotation section (generation
      mechanics, pruning behavior for each) and ADR 0081; this entry exists only to place the
      route in herald's inventory alongside everything else.
- [ ] Requires `X-Operator-Actor` (same attribution mechanism [tower Story 010](../tower/010-activity-feed.md)
      established) — herald joined the shared operator-token distribution for this route
      specifically and gets the same accountability requirement every other operator-mutating
      route in this design now has.

---

## Activity

### `GET /tenants/{tenantSlug}/activity`

- [ ] Gated by `activity:read`. Same shared `{ timestamp, actorType, actorId, eventType,
      summary }` shape as tower's and keep's own `/activity` routes (ADR 0060).
- [ ] Built the same way [tower Story 010](../tower/010-activity-feed.md) designed its own feed:
      discover this tenant's relevant actor ids per type (`communicationType`, `template`,
      `sendingConfig` — all carry `tenant` in their key or `searchableBy`, Story 001), then one
      `getEventStream` call across them, mapped through per-event-type summary formatters. **Not**
      applied to `communication` or `optOut`/`suppression` — a tenant's send volume could be
      thousands of events a day, which would drown out the genuinely admin-relevant entries
      (a new communication type created, a template edited, sending config changed) this feed
      exists to surface. Bulk send history already has its own dedicated, filterable view
      ([Story 004](004-communication-history-opt-outs-and-suppressions.md)'s `/communications`
      list) — this feed isn't meant to duplicate it.

---

## Not Covered Here

- Herald's own signet bundle bootstrap (the one-time operator-provisioned admin token) — an
  operational/deployment concern, not a route.
