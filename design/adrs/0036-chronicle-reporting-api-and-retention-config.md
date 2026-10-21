# ADR 0036: `chronicle`'s Reporting API and Retention Configuration

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** chronicle, portcullis, web

> **Filled by [ADR 0085](0085-chronicle-clickhouse-schema.md):** the schema referenced below as
> "discussed alongside ADR 0035" was never actually written into either ADR — a real gap, closed
> while writing chronicle's Stories, not before.

## Context

Following on from `chronicle`'s ClickHouse schema (discussed alongside ADR 0035): retention
needs to be configuration, not a hardcoded DDL value, and the query/reporting API `web` will
consume was deferred until the storage design settled.

## Decision

### Retention is signet-delivered configuration, defaulting to 24 months

`chronicle` gets its own signet bundle (ADR 0004's pattern — every service sources its
operational config/secrets from signet, no exceptions), holding `retentionMonths` (default
`24`) alongside its ClickHouse and RabbitMQ connection details. The table's `TTL` clause is
built from this config value, not a literal hardcoded in the schema.

Not designed now, but worth naming as a viable future extension: ClickHouse supports row-level
`TTL` expressions referencing a column (`TTL timestamp + INTERVAL retention_months MONTH`),
which would allow per-tenant retention overrides later without a schema change, if a specific
tenant ever needs longer/shorter retention than the default. Global config is sufficient today.

### Reporting API: purpose-built reports plus one constrained query endpoint

**Auth model** — identical to herald (ADR 0034): behind portcullis, authorized via
`permissions` claims on the portcullis-forwarded internal JWT, independently verified by
chronicle on top of portcullis already gating access. No operator tier — chronicle has no
bootstrap problem to solve.

**Purpose-built reports** for the two known high-value, generically-awkward-to-express cases:

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/analytics/reports/auth-funnel` | `GET` | Login attempts/success/failure by provider, signup conversion, invite/code redemption rates. Query params: date range, optional `application` |
| `/tenants/{tenantSlug}/analytics/reports/active-users` | `GET` | DAU/WAU/MAU. Query params: date range, `granularity`, optional `application`. **Omitted** `application` deduplicates tenant-wide via `identityHash` — the exact problem that originally motivated tenant-scoped identity resolution (ADR 0016/0017); an org with several products still wants that rollup. **Specified** `application` scopes the same dedup logic to activity within just that one product — an org with several applications will just as often want to know how one specific product is doing on its own, not only the aggregate |

A **per-application breakdown** (comparing all of a tenant's applications side by side in one
call, rather than either the full rollup or one at a time) doesn't need a third report
endpoint — it's already expressible on the query endpoint below via
`metric: 'unique_count', groupBy: ['application']`, since `application` is already part of the
allowed `groupBy` vocabulary.

**A constrained metrics-query endpoint** for everything else:

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/analytics/query` | `POST` | See below |

```ts
{
  metric: 'count' | 'unique_count' | 'avg_latency' | 'p50_latency' | 'p95_latency' | 'p99_latency',
  eventType: '' | [''],             // exact type(s) or a prefix pattern, e.g. 'auth.*'
  groupBy: ['application' | 'eventType' | 'day' | 'week' | 'month' | 'status' | 'method'],
  filters: { application: '', status: 0, method: '' },   // from the same allowed vocabulary as groupBy
  dateRange: { from: '', to: '' },
}
```

`POST` here is not a violation of the state-transition-as-`PATCH` convention (ADR 0030/0031) —
this is the well-established exception search/query endpoints get (Elasticsearch's `_search` is
the canonical example): the query is what's being submitted for execution, not an action verb
on an existing resource, and it genuinely doesn't fit a `GET`'s query string. `groupBy` and
`filters` are drawn from an **allowed vocabulary**, not arbitrary field names — this is what
keeps the endpoint from becoming an open, unsafe query surface against a multi-tenant table
while still letting `web` build new dashboard views without new backend endpoints for every
case. `tenant` is never a caller-supplied filter — it's enforced from the URL/auth context the
same way every other tenant-scoped endpoint in this system already works.

### Guardrails

- A maximum date range per query, well under the retention period, not just capped at it.
- A query timeout.
- Per-tenant rate limiting on the query endpoint — same resource-protection instinct already
  applied to invite quotas (ADR 0019) and lookout's client-facing path (ADR 0035).
- ClickHouse's native query cache is a good, low-effort fit for the common "same dashboard
  reloaded repeatedly" access pattern — worth using before reaching for a separate caching
  layer.

## Consequences

- `chronicle` needs its own signet bundle.
- The metrics-query endpoint's `groupBy`/`filters` vocabulary is a starting set — extending it
  is expected as `web`'s actual dashboard needs become concrete, without needing new endpoints
  for each addition.

## Related

- [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0034](0034-herald-api-surface.md)
