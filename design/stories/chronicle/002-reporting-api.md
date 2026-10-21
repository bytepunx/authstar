---
title: "Story 002: Reporting API"
updated: 2026-08-06
status: draft
---
# Story 002 — Reporting API

**Epic:** Analytics Storage
**Repo:** chronicle
**Status:** Draft
**New — chronicle's side of the routes [ADR 0036](../../adrs/0036-chronicle-reporting-api-and-retention-config.md)
already specifies.** Per [ADR 0034](../../adrs/0034-herald-api-surface.md) (auth model
this mirrors), [ADR 0036](../../adrs/0036-chronicle-reporting-api-and-retention-config.md),
[ADR 0056](../../adrs/0056-gdpr-data-export.md),
[ADR 0058](../../adrs/0058-analytics-event-shape-corrections.md),
[ADR 0059](../../adrs/0059-web-analytics-screens.md).
**Depends on:** [ADR 0085](../../adrs/0085-chronicle-clickhouse-schema.md)'s
`analytics_events` table, [Story 001](001-event-consumption.md)'s write path.

---

## Auth model

- [ ] Identical posture to herald (ADR 0034/0036): behind portcullis, authorized via
      `permissions` claims on the forwarded internal JWT, independently re-verified by chronicle
      on top of portcullis already gating access. No operator tier — chronicle has no bootstrap
      problem. Gated by `analytics:read` throughout (ADR 0059).
- [ ] `tenant` is **never** a caller-supplied filter on any route below — always enforced from
      the URL/auth context, matching `ORDER BY`'s own leading column (ADR 0085) at the storage
      layer too.

---

## `GET /tenants/{tenantSlug}/analytics/reports/auth-funnel`

- [ ] Query params: date range, optional `application`.
- [ ] Login attempts/success/failure **by provider**: `count()` grouped by `idp`, filtered to
      `eventType IN ('auth.login-succeeded', 'auth.login-failed')`.
- [ ] Signup conversion: `count(eventType = 'auth.signup-completed') / count(eventType =
      'auth.login-succeeded')` — exactly the ratio ADR 0058 named as the reason
      `signup-completed` exists at all.
- [ ] **Invite/invite-code redemption — a real, named limitation, not silently computed as a
      full rate.** Chronicle only ever sees `analytics.auth.invite-redeemed` **events**, never
      issuance counts (how many invites/codes were issued lives in tower's own `invite`/
      `inviteCode` actors, not in this pipeline at all). This report can surface the raw
      **count/trend** of redemption events over the date range — it cannot compute a true
      "redemption rate" (redeemed ÷ issued) on its own, since it has no denominator. If `web`
      wants an actual rate, it has to combine this count with tower's own issuance counts
      itself (two API calls, client-side arithmetic) — not something chronicle's response
      pretends to already provide. Worth stating plainly rather than letting the report's name
      ("auth funnel") imply a completeness it doesn't have for this one metric.

## `GET /tenants/{tenantSlug}/analytics/reports/active-users`

- [ ] Query params: date range, `granularity` (`day`/`week`/`month`), optional `application`.
- [ ] `uniq(identityHash)` (ClickHouse's approximate cardinality function, ADR 0085 — not
      `uniqExact`) grouped by the requested granularity's own time bucket.
- [ ] **Omitted `application`**: dedupes tenant-wide — the exact cross-application rollup
      problem tenant-scoped identity resolution originally existed to solve (ADR 0016/0017).
      **Specified `application`**: same dedup logic, scoped to `WHERE application = '...'`.
- [ ] This same query, computed for the current period only, is what drives `web`'s Overview
      summary tile — "one mechanism, two renderings" (ADR 0059), not a separate implementation.

---

## `POST /tenants/{tenantSlug}/analytics/query` — constrained metrics query

- [ ] Exact request shape (ADR 0036):

```ts
{
  metric: 'count' | 'unique_count' | 'avg_latency' | 'p50_latency' | 'p95_latency' | 'p99_latency',
  eventType: '' | [''],
  groupBy: ['application' | 'eventType' | 'day' | 'week' | 'month' | 'status' | 'method'],
  filters: { application: '', status: 0, method: '' },
  dateRange: { from: '', to: '' },
}
```

- [ ] Maps directly onto `analytics_events`'s real columns (ADR 0085) — `application` →
      `application`, `eventType` → `eventType` (exact match or `LIKE 'prefix.%'` for a
      `'auth.*'`-style pattern), `status`/`method` → their own columns, `day`/`week`/`month` →
      `toStartOfDay(timestamp)`/`toStartOfWeek`/`toStartOfMonth`. `unique_count` uses `uniq()`,
      matching the active-users report's own choice.
- [ ] `groupBy`/`filters` values outside the allowed vocabulary above are rejected (`400`), not
      silently ignored — the vocabulary is what keeps this from becoming an open query surface
      against a multi-tenant table (ADR 0036); a typo'd `groupBy` value should fail loudly, not
      quietly return an ungrouped result the caller might mistake for correct.
- [ ] Response: `{ results: [{ ...groupBy key/value pairs, value: 0 }] }` — one row per unique
      combination of the requested `groupBy` dimensions, `value` holding the computed `metric`.
      No response shape was given anywhere in the ADRs; this is the story's own contribution,
      shaped to be exactly what a charting library consumes directly (an array of labeled
      points), consistent with ADR 0059's framing of the Explore screen as "a UI directly over
      the `/query` endpoint."

### Guardrails (ADR 0036)

- [ ] Maximum date range per query — well under `retentionMonths`, not merely capped at it.
- [ ] A query timeout.
- [ ] Per-tenant rate limiting — same instinct as invite quotas and lookout's own client-facing
      path.
- [ ] Relies on ClickHouse's native query cache for the "same dashboard reloaded repeatedly"
      pattern, before reaching for a separate caching layer (ADR 0036's own recommendation).

---

## `POST /tenants/{tenantSlug}/analytics/export-summary`

- [ ] Exact shape, both directions, already fully specified (ADR 0056) — not re-derived, only
      the underlying query is new here:

```json
// request
{ "identityHashes": [""] }
// response
{ "eventCounts": { "auth.login-succeeded": 0, "request": 0 }, "firstSeen": "", "lastSeen": "" }
```

- [ ] `eventCounts`: `count()` grouped by `eventType`, `WHERE identityHash IN (...)`.
      `firstSeen`/`lastSeen`: `min(timestamp)`/`max(timestamp)` over the same filter.
- [ ] Called only by `web` as part of its cross-service export assembly (tower resolves the
      `identityHashes` for an account first, ADR 0056) — never called with a caller-supplied
      `contactId` or `accountId` directly, since chronicle has no way to resolve either on its
      own (ADR 0035's identity-is-`identityHash`-only rule, unaffected by this route).
- [ ] Same rate-limiting/timeout guardrails as the `/query` endpoint — a list of `identityHashes`
      is still a query, not exempted from the guardrails just because its shape is fixed.

---

## Not Covered Here

- Event consumption/storage — [Story 001](001-event-consumption.md).
- `web`'s own screens consuming these routes — [ADR 0059](../../adrs/0059-web-analytics-screens.md),
  `web`'s own future stories.
