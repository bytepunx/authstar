---
title: "Story 002: Send Worker and Retry"
updated: 2026-08-05
status: draft
---
# Story 002 — Send Worker and Retry

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — herald's side of the mechanism [ADR 0022](../../adrs/0022-herald-communications-service.md)/
[ADR 0032](../../adrs/0032-per-tenant-sending-and-can-spam.md)/
[ADR 0033](../../adrs/0033-herald-send-worker-and-retry.md) already specify.**
Per [ADR 0022](../../adrs/0022-herald-communications-service.md),
[ADR 0025](../../adrs/0025-versioned-templates-and-encrypted-payloads.md),
[ADR 0032](../../adrs/0032-per-tenant-sending-and-can-spam.md),
[ADR 0033](../../adrs/0033-herald-send-worker-and-retry.md),
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md),
[ADR 0078](../../adrs/0078-herald-template-branding.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `communication`/`template`/
`sendingConfig`/`optOut`/`suppression` shapes.

---

## Ingestion — durable first, retry logic lives entirely in herald's own state after that

- [ ] Consumes `comms.*` messages from RabbitMQ (ADR 0022's routing). On receipt, creates the
      `communication` actor (`status: "pending"`) — this durable creation is what the message
      gets **acked** on, not on successful send. Once created, retry/delivery logic lives
      entirely in herald's own state from that point forward; RabbitMQ's job for this message is
      already done.
- [ ] The message carries the encrypted segment (`to`, `templateData`) already encrypted by the
      **publisher** using herald's current public key (Story 001's payload-encryption keypair) —
      herald never receives plaintext PII over the wire at all, only ciphertext it can decrypt
      itself.

---

## Suppression and opt-out — checked before every send attempt, including retries

- [ ] Before calling any adapter (first attempt or a retry), check `suppression` (blanket, any
      category) and, if `category === "marketing"`, `optOut` (category-scoped) — either match
      sets `status: "suppressed"` immediately, **no adapter call made**, terminal (Story 001,
      ADR 0074/0032).
- [ ] This check runs **every time**, not just at first attempt — a suppression added *between*
      the first attempt and a scheduled retry must still block the retry. A `communication`
      already `"pending"` when a suppression is added doesn't get a special early-exit; the next
      scheduled attempt catches it naturally.

---

## Rendering

- [ ] Fetch the `template` version matching `(tenant, communicationType, templateVersion)` —
      `templateVersion` was already pinned on the `communication` record at creation time (Story
      001), so a template edited *after* this communication was queued doesn't change what
      actually gets rendered.
- [ ] Decrypt `encryptedPayload` transiently, in memory, using the private key generation
      selected by the record's own `payloadKeyVersion` (Story 001/ADR 0081) — never a different
      generation, even if a newer one is now current.
- [ ] Render `subjectTemplate`/`bodyTemplate` against `templateData` via logic-less mustache-style
      substitution (ADR 0078) — no template-side logic to fail or misbehave.
- [ ] For `category: "marketing"`: append the CAN-SPAM footer (`sendingConfig.physicalAddress` +
      unsubscribe link) and set `List-Unsubscribe`/`List-Unsubscribe-Post` headers (ADR 0032) —
      never for `transactional`, never auto-detected from content.

---

## Dispatch and outcome

- [ ] Calls the tenant's configured adapter (`sendingConfig.provider`, Story 001) —
      `send(message) → { success, providerMessageId, error }`, one interface, SMTP or
      API-based implementations behind it (ADR 0032).
- [ ] **Success** → `status: "sent"`, `sentAt: now`, `providerMessageId` stored (needed later to
      correlate an inbound bounce/complaint notification, ADR 0074). **`status: "delivered"`
      exists in the enum but nothing in this story ever sets it** — confirming delivery (as
      opposed to acceptance by the provider) would need provider-specific webhook/polling support
      not designed anywhere in this pass; named honestly as an unbuilt state, not silently
      ignored.
- [ ] **Failure** → the adapter's returned `error` is classified: **transient** (network timeout,
      provider rate-limit) sets `nextRetryAt`/`retryCount`/`lastAttemptAt`/`lastError` (Story
      001) for the scheduled sweep to retry; **permanent** (invalid recipient format, bad
      credentials) sets `status: "failed"` immediately, no retry scheduled.
- [ ] **Exhausted retries** land in `status: "failed"` — the same terminal value as an immediate
      permanent failure, no separate "gave up" state. Terminal either way; no further automatic
      retry attempted.

---

## Scheduled retry sweep

- [ ] A periodic job (same operational shape as this design's other scheduled sweeps — ADR
      0012's provisioner, ADR 0029's retention purge) finds `communication` records with
      `status: "pending"` (or a transient-failure marker) and `nextRetryAt <= now`, and re-runs
      the suppression/opt-out check → render → dispatch sequence above unchanged — retries are
      not a special code path, they're the same handling triggered by a different caller (the
      sweep instead of the original RabbitMQ message).

---

## Manual retry

### `PATCH /tenants/{tenantSlug}/communications/{id}` — `{ status: "pending" }`

- [ ] The actual mechanism (ADR 0033) — resets a `"failed"` record back into the same sweep-
      eligible state a transient failure would naturally reach, no separate resend endpoint.
      Runs through the identical suppression/opt-out → render → dispatch sequence — a manually
      retried send to a since-suppressed contact still gets suppressed, not force-sent.

---

## Not Covered Here

- Bounce/complaint webhook handling (SES/SNS) that populates `providerMessageId` correlation and
  creates `suppression` records — already fully specified at the ADR level (ADR 0074), a future
  story gives it route-level treatment the way this one did for sending.
- The retention purge sweep that clears `encryptedPayload` and prunes payload-key generations —
  already specified (ADR 0029/0081), not re-derived here.
