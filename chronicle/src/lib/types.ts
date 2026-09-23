// Shared types for chronicle's one domain table (ADR 0085's `analytics_events`)
// and the query shapes both the RabbitMQ consumer (Story 001) and the
// reporting API (Story 002) operate on.

// The row shape mirrors ADR 0085's DDL column-for-column. Nullable columns
// are modeled as `| null`, never left `undefined` -- a field that doesn't
// apply to a given event's type is explicitly NULL, not missing data
// (Story 001's own framing).
export interface AnalyticsEventRow {
  tenant: string
  application: string
  eventType: string
  // ISO-8601 string (with milliseconds) -- matches DateTime64(3)'s precision.
  timestamp: string
  identityHash: string | null

  // auth-event fields (`eventType` starting with `auth.`)
  idp: string | null
  reason: string | null

  // request-event fields (`eventType === 'request'`)
  method: string | null
  path: string | null
  status: number | null
  latencyMs: number | null

  // client-event field (`eventType` starting with `client.`) -- raw
  // JSON-encoded payload, lookout's allowlist defines its shape, not this
  // schema.
  clientPayload: string | null

  // Assigned at ingestion (lookout), for tracing/debugging only -- never a
  // dedup key (ADR 0085: plain MergeTree, no dedup).
  eventId: string
}

export interface DateRange {
  from: string
  to: string
}

export type Granularity = 'day' | 'week' | 'month'

export interface AuthFunnelQuery {
  tenant: string
  dateRange: DateRange
  application?: string
}

export interface AuthFunnelProviderCounts {
  idp: string | null
  succeeded: number
  failed: number
}

export interface AuthFunnelFailureReason {
  reason: string
  count: number
}

export interface AuthFunnelResult {
  byProvider: AuthFunnelProviderCounts[]
  failureReasons: AuthFunnelFailureReason[]
  signupConversion: {
    signups: number
    logins: number
    rate: number | null
  }
  inviteRedemptions: {
    count: number
    // A real, named limitation (Story 002): chronicle only ever sees
    // redemption events, never issuance counts, so it cannot compute a true
    // rate -- only the raw count/trend of redemption events.
    note: string
  }
}

export interface ActiveUsersQuery {
  tenant: string
  dateRange: DateRange
  granularity: Granularity
  application?: string
}

export interface ActiveUsersBucket {
  bucket: string
  uniqueUsers: number
}

export interface ActiveUsersResult {
  granularity: Granularity
  buckets: ActiveUsersBucket[]
}

export type MetricName =
  | 'count'
  | 'unique_count'
  | 'avg_latency'
  | 'p50_latency'
  | 'p95_latency'
  | 'p99_latency'

export type GroupByDimension =
  | 'application'
  | 'eventType'
  | 'day'
  | 'week'
  | 'month'
  | 'status'
  | 'method'

export interface MetricsQueryFilters {
  application?: string
  status?: number
  method?: string
}

export interface MetricsQuery {
  tenant: string
  metric: MetricName
  eventType?: string | string[]
  groupBy: GroupByDimension[]
  filters?: MetricsQueryFilters
  dateRange: DateRange
}

export interface MetricsQueryResultRow {
  [dimension: string]: string | number
}

export interface MetricsQueryResult {
  results: MetricsQueryResultRow[]
}

export interface ExportSummaryQuery {
  tenant: string
  identityHashes: string[]
}

export interface ExportSummaryResult {
  eventCounts: Record<string, number>
  firstSeen: string | null
  lastSeen: string | null
}

// The allowed vocabulary for `groupBy`/`filters` on the constrained query
// endpoint (ADR 0036) -- kept as a real runtime const, not just a type, so
// both the fastify schema and the ClickHouse SQL builder validate against
// the exact same list.
export const ALLOWED_GROUP_BY: readonly GroupByDimension[] = [
  'application',
  'eventType',
  'day',
  'week',
  'month',
  'status',
  'method',
] as const

export const ALLOWED_METRICS: readonly MetricName[] = [
  'count',
  'unique_count',
  'avg_latency',
  'p50_latency',
  'p95_latency',
  'p99_latency',
] as const

// The chronicle-recognized event-type vocabulary (Story 001: "an eventType
// chronicle doesn't recognize" is dropped, not stored). `client.*` is an
// open prefix -- lookout owns the allowlist of specific client event types,
// chronicle only needs to recognize the category.
export const RECOGNIZED_NON_CLIENT_EVENT_TYPES: readonly string[] = [
  'request',
  'auth.login-succeeded',
  'auth.login-failed',
  'auth.logout',
  'auth.invite-redeemed',
  'auth.signup-completed',
] as const

export function isRecognizedEventType(eventType: string): boolean {
  return (
    RECOGNIZED_NON_CLIENT_EVENT_TYPES.includes(eventType) ||
    eventType.startsWith('client.')
  )
}

export interface ClickHouseApi {
  // Story 001's write path -- batched insert, no dedup, no upsert.
  insertEvents(rows: AnalyticsEventRow[]): Promise<void>

  // Story 002's read paths. Modeled as structured methods (not raw SQL
  // strings) so a real ClickHouse-backed implementation and an in-memory
  // fake implementation can both satisfy the exact same query *semantics*
  // -- mirroring tower's in-memory-vs-Postgres `consequent` adapter split.
  authFunnel(query: AuthFunnelQuery): Promise<AuthFunnelResult>
  activeUsers(query: ActiveUsersQuery): Promise<ActiveUsersResult>
  metricsQuery(query: MetricsQuery): Promise<MetricsQueryResult>
  exportSummary(query: ExportSummaryQuery): Promise<ExportSummaryResult>

  // Table lifecycle -- builds the `TTL` clause from signet-delivered config
  // (ADR 0085), never a hardcoded literal.
  ensureSchema(retentionMonths: number): Promise<void>

  ping(): Promise<boolean>
  close(): Promise<void>
}
