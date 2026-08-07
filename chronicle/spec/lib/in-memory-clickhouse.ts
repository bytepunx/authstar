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
  MetricsQuery,
  MetricsQueryResult,
  MetricsQueryResultRow,
} from '../../src/lib/types.js'

// In-memory fake `ClickHouseApi`, mirroring tower's own
// `spec/lib/in-memory-consequent.ts` convention: real query *semantics*,
// implemented over a plain in-memory array rather than mocked responses,
// so behavior/e2e tests exercise the actual filtering/grouping/aggregation
// logic each report describes (Story 002) -- just not ClickHouse's own SQL
// engine, which the integration tier proves separately against a real
// instance.

function inRange(timestamp: string, from: string, to: string): boolean {
  const t = new Date(timestamp).getTime()
  return t >= new Date(from).getTime() && t <= new Date(to).getTime()
}

function startOfDay(timestamp: string): string {
  const d = new Date(timestamp)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

function startOfWeek(timestamp: string): string {
  const d = new Date(timestamp)
  const day = d.getUTCDay() // 0 (Sun) .. 6 (Sat)
  // ClickHouse's `toStartOfWeek` defaults to Monday-start (mode 0 in
  // 1-indexed terms maps to Sunday by default, but ISO/Monday-start is the
  // more common analytics convention and what this fake standardizes on).
  const diff = (day + 6) % 7
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
  return start.toISOString()
}

function startOfMonth(timestamp: string): string {
  const d = new Date(timestamp)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

const BUCKET_FNS = { day: startOfDay, week: startOfWeek, month: startOfMonth }

const GROUP_BY_KEY: Record<GroupByDimension, (row: AnalyticsEventRow) => string | number | null> = {
  application: (row) => row.application,
  eventType: (row) => row.eventType,
  day: (row) => startOfDay(row.timestamp),
  week: (row) => startOfWeek(row.timestamp),
  month: (row) => startOfMonth(row.timestamp),
  status: (row) => row.status,
  method: (row) => row.method,
}

function approxUniq(values: Iterable<string>): number {
  // A real fake would use HyperLogLog to mirror ClickHouse's `uniq()`
  // approximation exactly; for test purposes an exact `Set` count is a
  // faithful-enough stand-in -- the point under test is the *dedup
  // dimension* (tenant-wide vs. per-application), not HLL's own error
  // bounds, which the integration tier's real ClickHouse instance covers.
  return new Set(values).size
}

export default class InMemoryClickHouseClient implements ClickHouseApi {
  private rows: AnalyticsEventRow[] = []
  private schemaEnsured = false
  private retentionMonths: number | null = null

  async ensureSchema(retentionMonths: number): Promise<void> {
    this.schemaEnsured = true
    this.retentionMonths = retentionMonths
  }

  async ping(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {}

  async insertEvents(rows: AnalyticsEventRow[]): Promise<void> {
    this.rows.push(...rows)
  }

  // Test-only accessors, not part of `ClickHouseApi`.
  allRows(): readonly AnalyticsEventRow[] {
    return this.rows
  }

  wasSchemaEnsured(): boolean {
    return this.schemaEnsured
  }

  configuredRetentionMonths(): number | null {
    return this.retentionMonths
  }

  async authFunnel(query: AuthFunnelQuery): Promise<AuthFunnelResult> {
    const scoped = this.rows.filter((row) =>
      row.tenant === query.tenant &&
      inRange(row.timestamp, query.dateRange.from, query.dateRange.to) &&
      (query.application === undefined || row.application === query.application),
    )

    const loginRows = scoped.filter((row) => row.eventType === 'auth.login-succeeded' || row.eventType === 'auth.login-failed')
    const byProviderMap = new Map<string | null, { succeeded: number; failed: number }>()
    for (const row of loginRows) {
      const entry = byProviderMap.get(row.idp) ?? { succeeded: 0, failed: 0 }
      if (row.eventType === 'auth.login-succeeded') entry.succeeded += 1
      else entry.failed += 1
      byProviderMap.set(row.idp, entry)
    }

    const failureReasonMap = new Map<string, number>()
    for (const row of scoped) {
      if (row.eventType === 'auth.login-failed' && row.reason) {
        failureReasonMap.set(row.reason, (failureReasonMap.get(row.reason) ?? 0) + 1)
      }
    }

    const logins = scoped.filter((row) => row.eventType === 'auth.login-succeeded').length
    const signups = scoped.filter((row) => row.eventType === 'auth.signup-completed').length
    const inviteRedemptions = scoped.filter((row) => row.eventType === 'auth.invite-redeemed').length

    return {
      byProvider: [...byProviderMap.entries()].map(([idp, counts]) => ({ idp, ...counts })),
      failureReasons: [...failureReasonMap.entries()].map(([reason, count]) => ({ reason, count })),
      signupConversion: { signups, logins, rate: logins > 0 ? signups / logins : null },
      inviteRedemptions: {
        count: inviteRedemptions,
        note: 'Redemption event count/trend only -- chronicle never sees invite/code issuance counts, so a true redemption rate cannot be computed here.',
      },
    }
  }

  async activeUsers(query: ActiveUsersQuery): Promise<ActiveUsersResult> {
    const scoped = this.rows.filter((row) =>
      row.tenant === query.tenant &&
      inRange(row.timestamp, query.dateRange.from, query.dateRange.to) &&
      (query.application === undefined || row.application === query.application) &&
      row.identityHash !== null,
    )

    const bucketFn = BUCKET_FNS[query.granularity]
    const buckets = new Map<string, Set<string>>()
    for (const row of scoped) {
      const bucket = bucketFn(row.timestamp)
      const set = buckets.get(bucket) ?? new Set<string>()
      set.add(row.identityHash as string)
      buckets.set(bucket, set)
    }

    return {
      granularity: query.granularity,
      buckets: [...buckets.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([bucket, set]) => ({ bucket, uniqueUsers: approxUniq(set) })),
    }
  }

  async metricsQuery(query: MetricsQuery): Promise<MetricsQueryResult> {
    let scoped = this.rows.filter((row) =>
      row.tenant === query.tenant &&
      inRange(row.timestamp, query.dateRange.from, query.dateRange.to),
    )

    if (query.eventType !== undefined) {
      const values = Array.isArray(query.eventType) ? query.eventType : [query.eventType]
      scoped = scoped.filter((row) => values.some((value) => {
        if (value.endsWith('.*')) return row.eventType.startsWith(value.slice(0, -1))
        return row.eventType === value
      }))
    }
    if (query.filters?.application !== undefined) {
      scoped = scoped.filter((row) => row.application === query.filters!.application)
    }
    if (query.filters?.status !== undefined) {
      scoped = scoped.filter((row) => row.status === query.filters!.status)
    }
    if (query.filters?.method !== undefined) {
      scoped = scoped.filter((row) => row.method === query.filters!.method)
    }

    const groups = new Map<string, { key: MetricsQueryResultRow; rows: AnalyticsEventRow[] }>()
    for (const row of scoped) {
      const keyParts: MetricsQueryResultRow = {}
      for (const dimension of query.groupBy) {
        keyParts[dimension] = GROUP_BY_KEY[dimension](row) ?? ''
      }
      const cacheKey = JSON.stringify(keyParts)
      const group = groups.get(cacheKey) ?? { key: keyParts, rows: [] }
      group.rows.push(row)
      groups.set(cacheKey, group)
    }

    // No `groupBy` dimensions -> every row shares the same (empty) key, so
    // the loop above already collapsed them into a single group. The one
    // exception: zero matching rows at all -- a real aggregate query with
    // no `GROUP BY` still returns exactly one row (`value: 0`), it never
    // returns zero rows, so that case is added back explicitly here.
    if (query.groupBy.length === 0 && groups.size === 0) {
      groups.set('__all__', { key: {}, rows: [] })
    }

    const results = [...groups.values()].map(({ key, rows }) => ({
      ...key,
      value: computeMetric(query.metric, rows),
    }))

    return { results }
  }

  async exportSummary(query: ExportSummaryQuery): Promise<ExportSummaryResult> {
    const scoped = this.rows.filter((row) =>
      row.tenant === query.tenant &&
      row.identityHash !== null &&
      query.identityHashes.includes(row.identityHash),
    )

    const eventCounts: Record<string, number> = {}
    for (const row of scoped) {
      eventCounts[row.eventType] = (eventCounts[row.eventType] ?? 0) + 1
    }

    const timestamps = scoped.map((row) => new Date(row.timestamp).getTime())
    return {
      eventCounts,
      firstSeen: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
      lastSeen: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
    }
  }
}

function computeMetric(metric: MetricsQuery['metric'], rows: AnalyticsEventRow[]): number {
  if (metric === 'count') return rows.length
  if (metric === 'unique_count') return approxUniq(rows.map((row) => row.identityHash).filter((v): v is string => v !== null))

  const latencies = rows.map((row) => row.latencyMs).filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (latencies.length === 0) return 0
  if (metric === 'avg_latency') return latencies.reduce((sum, v) => sum + v, 0) / latencies.length

  const percentile = metric === 'p50_latency' ? 0.5 : metric === 'p95_latency' ? 0.95 : 0.99
  const index = Math.min(latencies.length - 1, Math.floor(percentile * latencies.length))
  return latencies[index]
}
