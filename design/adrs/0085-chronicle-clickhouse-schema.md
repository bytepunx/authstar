---
id: ADR-0085
title: Chronicle's ClickHouse Schema
status: accepted
date: 2026-08-06
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0085: Chronicle's ClickHouse Schema

- **Status:** Accepted
- **Date:** 2026-08-06
- **Affects:** chronicle
- **Fills a gap left open by:** [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md)

## Context

ADR 0036 opens by referring to "chronicle's ClickHouse schema (discussed alongside ADR 0035)" —
but no table, column list, partition key, or ordering key was ever actually written into either
ADR. Both the retention `TTL` mechanism (ADR 0036) and the reporting/query API's `groupBy`/
`filters` vocabulary (ADR 0036) depend on a real schema existing; neither can be implemented
against a table that was only ever discussed, not designed. This is a genuine specification gap,
not a correction of an existing decision — the first "fill the missing foundation" ADR in this
pass, rather than a "fix what's there" one.

## Decision

One wide table, not one per event type.

### One wide table, not one per event type

```sql
CREATE TABLE analytics_events (
  tenant String,
  application String,
  eventType String,             -- 'auth.login-succeeded', 'request', 'client.<type>', ...
  timestamp DateTime64(3),
  identityHash Nullable(String),

  -- auth-event fields
  idp Nullable(String),
  reason Nullable(String),        -- login-failed only

  -- request-event fields
  method Nullable(String),
  path Nullable(String),
  status Nullable(UInt16),
  latencyMs Nullable(UInt32),

  -- client-event field -- payload shape is lookout's allowlist to define, not a fixed column set
  clientPayload Nullable(String),  -- JSON-encoded; ClickHouse's JSON functions query into it if needed

  eventId String                  -- assigned at ingestion (lookout), for tracing/debugging only
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant, eventType, timestamp)
TTL timestamp + INTERVAL retentionMonths MONTH
```

**One table, sparse nullable columns, not a table per event type.** ClickHouse's columnar
storage makes wide, sparse tables genuinely cheap (an unused nullable column costs
next-to-nothing per row), and the constrained query endpoint (ADR 0036) needs to aggregate
*across* event types in a single query (`eventType: 'auth.*'`, `groupBy: ['eventType']`) — which
a per-type table design would force into a `UNION` at query time for no real storage benefit in
exchange.

### `ORDER BY` starts with `tenant`, deliberately

Every other tenant-scoped read path in this design enforces `tenant` from the URL/auth context,
never as a caller-supplied filter (ADR 0036's own framing) — putting `tenant` first in the
`ORDER BY` key makes that enforcement cheap at the storage engine level too (ClickHouse prunes
by the leading `ORDER BY` columns first), not just correct at the API layer. `eventType` second
matches the query endpoint's own most common filter (`eventType`/prefix); `timestamp` last
supports the date-range filter every report and query call already requires.

### `MergeTree`, not a deduplicating engine

Chronicle "writes what arrived, make it queryable... no business invariants to enforce" (ADR
0035) — a plain, append-only `MergeTree` matches that exactly. No upsert/merge/dedup logic is
designed here: the pipeline is already explicitly loss-tolerant (non-durable RabbitMQ, ADR
0035), so occasional duplication under redelivery is an accepted trade-off of the same kind, not
a correctness requirement this schema needs to solve. `eventId` exists for tracing a specific
event during debugging, not as a dedup key.

### `TTL` is built from signet-delivered config, not a schema literal

`TTL timestamp + INTERVAL retentionMonths MONTH`, with `retentionMonths` sourced from chronicle's
own signet bundle (ADR 0036, default `24`) — the DDL references the config value at table-creation/
migration time, never hardcodes a number that would require a schema change to adjust later.
Monthly partitioning (`toYYYYMM`) is what makes TTL enforcement cheap — ClickHouse drops whole
expired partitions rather than deleting matching rows one at a time.

### Known, accepted limitation carried forward: raw `path`, no normalization

`path` stores exactly what portcullis saw (`/users/12345/profile`), not a normalized route
template (`/users/{id}/profile`) — path normalization was already named as an open item in ADR
0035 ("portcullis doesn't know an upstream's route templates... not designed here"), unaffected
by this schema. A future normalization pass would add a column, not restructure this one.

## Consequences

- Chronicle's RabbitMQ consumer (a future story) writes directly into this table — one insert
  path, no event-type branching into different tables.
- The reporting API (ADR 0036) and its `groupBy`/`filters` vocabulary now have concrete columns
  to map onto: `application` → `application`, `eventType` → `eventType`, `day`/`week`/`month` →
  derived from `timestamp`, `status`/`method` → their own columns.
- `unique_count` (auth-funnel/active-users dedup) uses ClickHouse's approximate `uniq()`
  (HyperLogLog-based) over `identityHash`, not `uniqExact()` — analytics doesn't need
  billing-grade precision, and `uniq()` is materially cheaper at this table's expected volume.

## Related

- [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md)
