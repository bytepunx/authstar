---
title: "Story 005: Usage Records and Usage-Reporting Credentials"
updated: 2026-08-05
status: draft
---
# Story 005 — Usage Records and Usage-Reporting Credentials

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the routes [ADR 0041](../../adrs/0041-keep-api-surface.md) already
specifies.** Per [ADR 0030](../../adrs/0030-tower-api-surface.md),
[ADR 0043](../../adrs/0043-application-reported-usage-metering.md),
[ADR 0079](../../adrs/0079-batched-usage-reporting-credentials.md),
[ADR 0083](../../adrs/0083-keep-actor-boundary-corrections.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `usageRecord`/
`usageReportingCredential` shapes.

---

## Usage Records

### `POST /tenants/{tenantSlug}/usage-records` — record usage

- [ ] **Two distinct callers, two distinct auth mechanisms, one shared handler** — this route is
      what both portcullis's `/_authstar/usage` (synchronous, internal-JWT-derived context) and
      `/_authstar/usage-reports` (batched, credential-derived context) ultimately call. Neither
      caller is trusted to supply `tenant`/`application`/`accountId` directly in the body — both
      arrive already resolved by whichever upstream authenticated the request (portcullis for the
      first, keep's own credential verification for the second, ADR 0079).
- [ ] Body/context: `{ tenant, application, accountId, meter, quantity, idempotencyKey }`.
      Idempotency expressed via the `Idempotency-Key` **header** (ADR 0030's convention) — the
      app-facing contract at the portcullis layer carries it in the request body for the app's
      own simplicity; portcullis translates one into the other when proxying (ADR 0041).
- [ ] Rejects unrecognized `meter` values — validated against the tenant's own `planMapping`
      entries with `meter` set (Story 001/003) — a typo'd meter name is a `4xx`, not a silent
      no-op recorded against nothing.
- [ ] `key` constructed as `{tenant}:{idempotencyKey}` (Story 001/ADR 0083's correction) — a
      redelivered or app-retried report with the same key is a no-op, not a double-charge.
- [ ] Response can include the current period's running total for that meter — a synchronous
      answer in addition to the async `entitlement.usage-updated` publish (below), useful for an
      app that wants to show a usage indicator immediately without waiting on the eventually-
      consistent path.
- [ ] Publishes `entitlement.usage-updated` (Story 001's shape) — current-value-replace, filtered
      to the resolved `application`. Publish cadence (every event vs. debounced) is keep's own
      implementation choice; tower doesn't care, it applies whatever value arrives (ADR 0043).

### `GET /tenants/{tenantSlug}/usage-records` — admin list

- [ ] Paginated, filterable by `meter`/`application`/date range — the canonical admin-facing
      view (ADR 0054 already named this explicitly as the one `web` shows; tower's own
      materialized `account.usage` copy is never separately surfaced in `web`, to avoid
      displaying two transiently-inconsistent numbers for the same thing).

### `GET /tenants/{tenantSlug}/usage-records/{id}` — single record

- [ ] `{id}` here is the full `{tenant}:{idempotencyKey}` key, or the bare `idempotencyKey` with
      `tenant` resolved from the URL the same way every other composite-keyed route in this
      design handles its route parameter (tower's `provider`/`inviteCode`/`coupon` precedent).

---

## Usage-Reporting Credentials

### `POST /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials` — issue

- [ ] Gated by `applications:manage` — not a billing permission, since this is squarely
      application-level operational config, the same category as hosts/upstream/CORS on the
      tower side (ADR 0079).
- [ ] Generates a high-entropy secret, returns it **once**, stores only a salted hash. **Not**
      pushed to signet — this credential is held by an external adopting application's own
      backend, outside authstar's trust boundary entirely (Story 001).

### `GET /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials` — list

- [ ] Metadata only (`credentialId`, `status`, `createdAt`) — the secret is never retrievable
      again after issuance, list or detail.

### `DELETE /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials/{credentialId}` — revoke

- [ ] `PATCH { status: "revoked" }` under the hood, `DELETE` as the actual route (ADR 0079 names
      this as `DELETE` directly, unlike most of this design's soft-delete routes which expose
      both — a deliberate simplicity choice for a resource with no meaningful "read a revoked
      one" use case).
- [ ] Multiple concurrent credentials per application remain valid throughout — revoking one
      doesn't affect any other, supporting create-new-then-revoke-old rotation with no forced
      downtime window.

---

## `POST /_authstar/usage-reports` verification (keep's side of ADR 0079)

- [ ] Verifies `Authorization: Bearer <credential>` against `usageReportingCredential`'s stored
      hash. **Cross-checks the credential's own `tenant`/`application` against what portcullis
      resolved from `Host`** and forwarded — a mismatch is rejected (`401`), defense in depth
      against a leaked credential being replayed against a different application's host than the
      one it was issued for.
- [ ] On success, resolves to the exact same `POST /tenants/{tenantSlug}/usage-records` handler
      above — one recording implementation, two ingress/auth paths, unchanged from ADR 0079's
      original framing.

---

## Not Covered Here

- Portcullis's own proxying mechanics for either ingress path — already fully specified in
  [Story 021](../proxy/021-usage-metering-reporting.md) and
  [Story 027](../proxy/027-batched-usage-reporting.md).
- Tower's consumption of `entitlement.usage-updated` into `account.usage` — already specified in
  [tower Story 001](../tower/001-actor-definitions.md).
