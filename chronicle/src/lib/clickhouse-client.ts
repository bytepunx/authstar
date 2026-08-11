import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type {
  ActiveUsersQuery,
  ActiveUsersResult,
  AnalyticsEventRow,
  AuthFunnelQuery,
  AuthFunnelResult,
  ClickHouseApi,
  ExportSummaryQuery,
  ExportSummaryResult,
  GroupByDimension,
  MetricName,
  MetricsQuery,
  MetricsQueryResult,
  MetricsQueryResultRow,
} from './types.js'

export interface ClickHouseClientOptions {
  url: string
  username: string
  password: string
  database: string
  // Applied as ClickHouse's own `max_execution_time` setting on every
  // read query -- Story 002 / ADR 0036's "a query timeout" guardrail.
  queryTimeoutMs: number
}

const GROUP_BY_SQL: Record<GroupByDimension, string> = {
  application: 'application',
  eventType: 'eventType',
  day: 'toStartOfDay(timestamp)',
  week: 'toStartOfWeek(timestamp)',
  month: 'toStartOfMonth(timestamp)',
  status: 'status',
  method: 'method',
}

const METRIC_SQL: Record<MetricName, string> = {
  count: 'count()',
  unique_count: 'uniq(identityHash)',
  avg_latency: 'avg(latencyMs)',
  p50_latency: 'quantile(0.5)(latencyMs)',
  p95_latency: 'quantile(0.95)(latencyMs)',
  p99_latency: 'quantile(0.99)(latencyMs)',
}

// ClickHouse's own DateTime64 *parameter binding* (as opposed to
// JSONEachRow insert parsing, which is more lenient) rejects RFC 3339
// strings outright -- `2026-08-01T00:00:00Z` 400s with "isn't parsed
// completely: only 19 of 20 bytes was parsed" because of the trailing
// `Z` and the `T` separator. It wants its own native text format
// (`YYYY-MM-DD HH:MM:SS.sss`, space-separated, no zone suffix -- found by
// actually running this against a real instance, not documented anywhere
// obvious). Every ISO date range this service accepts over HTTP is
// normalized through this before being bound as a query parameter.
function toClickHouseDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  )
}

const GRANULARITY_SQL = {
  day: 'toStartOfDay(timestamp)',
  week: 'toStartOfWeek(timestamp)',
  month: 'toStartOfMonth(timestamp)',
} as const

// Real, ClickHouse-backed implementation of `ClickHouseApi`. Each read
// method maps directly onto `analytics_events`'s real columns (ADR 0085) --
// mirrored, in semantics only, by `spec/lib/in-memory-clickhouse.ts`'s fake
// for the behavior/e2e tiers.
export default class RealClickHouseClient implements ClickHouseApi {
  private readonly client: ClickHouseClient
  private readonly queryTimeoutMs: number

  constructor(options: ClickHouseClientOptions) {
    this.queryTimeoutMs = options.queryTimeoutMs
    this.client = createClient({
      url: options.url,
      username: options.username,
      password: options.password,
      database: options.database,
      clickhouse_settings: {
        max_execution_time: Math.ceil(options.queryTimeoutMs / 1000),
      },
    })
  }

  async ensureSchema(retentionMonths: number): Promise<void> {
    // `TTL` is built from signet-delivered config, never a schema literal
    // (ADR 0085) -- the DDL string itself, not a stored setting, is what
    // encodes `retentionMonths` here.
    await this.client.command({
      query: `
        CREATE TABLE IF NOT EXISTS analytics_events (
          tenant String,
          application String,
          eventType String,
          timestamp DateTime64(3),
          identityHash Nullable(String),
          idp Nullable(String),
          reason Nullable(String),
          method Nullable(String),
          path Nullable(String),
          status Nullable(UInt16),
          latencyMs Nullable(UInt32),
          clientPayload Nullable(String),
          eventId String
        )
        ENGINE = MergeTree
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (tenant, eventType, timestamp)
        TTL timestamp + INTERVAL ${retentionMonths} MONTH
      `,
    })
  }

  async ping(): Promise<boolean> {
    const result = await this.client.ping()
    return result.success
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  // Not part of `ClickHouseApi` -- a real-backend-only introspection
  // helper (used by the integration tier to prove `ensureSchema` actually
  // baked the configured `retentionMonths` into the table's real DDL,
  // rather than trusting the string this class happened to send).
  async describeTableEngine(table = 'analytics_events'): Promise<string | null> {
    const rows = await this.rows<{ engine_full: string }>(
      'SELECT engine_full FROM system.tables WHERE database = currentDatabase() AND name = {table:String}',
      { table },
    )
    return rows[0]?.engine_full ?? null
  }

  async insertEvents(rows: AnalyticsEventRow[]): Promise<void> {
    if (rows.length === 0) return
    // toClickHouseDateTime is required here too, not just for query parameter
    // binding -- confirmed for real against a live instance: JSONEachRow insert
    // parsing rejects an RFC 3339 `timestamp` ("...T...Z") with "Cannot parse
    // input: expected '\"' before: ...", the exact same underlying DateTime64
    // format restriction this function's own comment already documents for the
    // query-parameter path. map-event.ts passes the incoming message's
    // timestamp straight through as an opaque string with no normalization.
    const normalizedRows = rows.map((row) => ({ ...row, timestamp: toClickHouseDateTime(row.timestamp) }))
    await this.client.insert({
      table: 'analytics_events',
      values: normalizedRows,
      format: 'JSONEachRow',
    })
  }

  async authFunnel(query: AuthFunnelQuery): Promise<AuthFunnelResult> {
    const applicationClause = query.application ? 'AND application = {application:String}' : ''
    const params = {
      tenant: query.tenant,
      from: toClickHouseDateTime(query.dateRange.from),
      to: toClickHouseDateTime(query.dateRange.to),
      application: query.application ?? '',
    }

    const byProviderRows = await this.rows<{ idp: string | null; succeeded: string; failed: string }>(`
      SELECT
        idp,
        countIf(eventType = 'auth.login-succeeded') AS succeeded,
        countIf(eventType = 'auth.login-failed') AS failed
      FROM analytics_events
      WHERE tenant = {tenant:String}
        AND eventType IN ('auth.login-succeeded', 'auth.login-failed')
        AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        ${applicationClause}
      GROUP BY idp
    `, params)

    const failureReasonRows = await this.rows<{ reason: string; count: string }>(`
      SELECT reason, count() AS count
      FROM analytics_events
      WHERE tenant = {tenant:String}
        AND eventType = 'auth.login-failed'
        AND reason IS NOT NULL
        AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        ${applicationClause}
      GROUP BY reason
    `, params)

    const [summary] = await this.rows<{ logins: string; signups: string; inviteRedemptions: string }>(`
      SELECT
        countIf(eventType = 'auth.login-succeeded') AS logins,
        countIf(eventType = 'auth.signup-completed') AS signups,
        countIf(eventType = 'auth.invite-redeemed') AS inviteRedemptions
      FROM analytics_events
      WHERE tenant = {tenant:String}
        AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        ${applicationClause}
    `, params)

    const logins = Number(summary?.logins ?? 0)
    const signups = Number(summary?.signups ?? 0)

    return {
      byProvider: byProviderRows.map((row) => ({
        idp: row.idp,
        succeeded: Number(row.succeeded),
        failed: Number(row.failed),
      })),
      failureReasons: failureReasonRows.map((row) => ({ reason: row.reason, count: Number(row.count) })),
      signupConversion: {
        signups,
        logins,
        rate: logins > 0 ? signups / logins : null,
      },
      inviteRedemptions: {
        count: Number(summary?.inviteRedemptions ?? 0),
        note: 'Redemption event count/trend only -- chronicle never sees invite/code issuance counts, so a true redemption rate cannot be computed here.',
      },
    }
  }

  async activeUsers(query: ActiveUsersQuery): Promise<ActiveUsersResult> {
    const applicationClause = query.application ? 'AND application = {application:String}' : ''
    const bucketSql = GRANULARITY_SQL[query.granularity]

    const rows = await this.rows<{ bucket: string; uniqueUsers: string }>(`
      SELECT ${bucketSql} AS bucket, uniq(identityHash) AS uniqueUsers
      FROM analytics_events
      WHERE tenant = {tenant:String}
        AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        ${applicationClause}
      GROUP BY bucket
      ORDER BY bucket
    `, {
      tenant: query.tenant,
      from: toClickHouseDateTime(query.dateRange.from),
      to: toClickHouseDateTime(query.dateRange.to),
      application: query.application ?? '',
    })

    return {
      granularity: query.granularity,
      buckets: rows.map((row) => ({ bucket: row.bucket, uniqueUsers: Number(row.uniqueUsers) })),
    }
  }

  async metricsQuery(query: MetricsQuery): Promise<MetricsQueryResult> {
    const params: Record<string, unknown> = {
      tenant: query.tenant,
      from: toClickHouseDateTime(query.dateRange.from),
      to: toClickHouseDateTime(query.dateRange.to),
    }

    const whereClauses = [
      'tenant = {tenant:String}',
      'timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}',
    ]

    whereClauses.push(...this.eventTypeClause(query.eventType, params))

    if (query.filters?.application !== undefined) {
      whereClauses.push('application = {filterApplication:String}')
      params.filterApplication = query.filters.application
    }
    if (query.filters?.status !== undefined) {
      whereClauses.push('status = {filterStatus:UInt16}')
      params.filterStatus = query.filters.status
    }
    if (query.filters?.method !== undefined) {
      whereClauses.push('method = {filterMethod:String}')
      params.filterMethod = query.filters.method
    }

    const selectDimensions = query.groupBy.map((dimension) => `${GROUP_BY_SQL[dimension]} AS ${dimension}`)
    const metricSql = `${METRIC_SQL[query.metric]} AS value`
    const groupBySql = query.groupBy.length > 0 ? `GROUP BY ${query.groupBy.join(', ')}` : ''

    const sql = `
      SELECT ${[...selectDimensions, metricSql].join(', ')}
      FROM analytics_events
      WHERE ${whereClauses.join(' AND ')}
      ${groupBySql}
    `

    const rows = await this.rows<MetricsQueryResultRow>(sql, params)
    return { results: rows.map((row) => ({ ...row, value: Number(row.value) })) }
  }

  async exportSummary(query: ExportSummaryQuery): Promise<ExportSummaryResult> {
    if (query.identityHashes.length === 0) {
      return { eventCounts: {}, firstSeen: null, lastSeen: null }
    }

    const params = { tenant: query.tenant, identityHashes: query.identityHashes }

    const eventCountRows = await this.rows<{ eventType: string; count: string }>(`
      SELECT eventType, count() AS count
      FROM analytics_events
      WHERE tenant = {tenant:String} AND identityHash IN {identityHashes:Array(String)}
      GROUP BY eventType
    `, params)

    const [range] = await this.rows<{ firstSeen: string | null; lastSeen: string | null }>(`
      SELECT min(timestamp) AS firstSeen, max(timestamp) AS lastSeen
      FROM analytics_events
      WHERE tenant = {tenant:String} AND identityHash IN {identityHashes:Array(String)}
    `, params)

    const eventCounts: Record<string, number> = {}
    for (const row of eventCountRows) {
      eventCounts[row.eventType] = Number(row.count)
    }

    return {
      eventCounts,
      firstSeen: range?.firstSeen ?? null,
      lastSeen: range?.lastSeen ?? null,
    }
  }

  private eventTypeClause(eventType: MetricsQuery['eventType'], params: Record<string, unknown>): string[] {
    if (eventType === undefined) return []
    const values = Array.isArray(eventType) ? eventType : [eventType]
    if (values.length === 0) return []

    // A single `'prefix.*'`-shaped value maps onto `LIKE 'prefix.%'`
    // (Story 002); anything else (a single exact value, or a list) maps
    // onto `IN (...)`.
    if (values.length === 1 && values[0].endsWith('.*')) {
      params.eventTypePrefix = `${values[0].slice(0, -1)}%`
      return ['eventType LIKE {eventTypePrefix:String}']
    }

    params.eventTypes = values
    return ['eventType IN {eventTypes:Array(String)}']
  }

  private async rows<T extends Record<string, unknown>>(query: string, params: Record<string, unknown>): Promise<T[]> {
    const result = await this.client.query({ query, query_params: params, format: 'JSONEachRow' })
    return result.json<T>()
  }
}
