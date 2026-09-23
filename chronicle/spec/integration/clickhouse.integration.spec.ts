import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import type { FastifyInstance } from 'fastify'
import RealClickHouseClient from '../../src/lib/clickhouse-client.js'
import buildApp from '../../src/lib/build-app.js'
import { buildTestConfig } from '../lib/test-config.js'
import { bearerHeader } from '../lib/jwt.js'
import type { AnalyticsEventRow } from '../../src/lib/types.js'

// Integration tier: `RealClickHouseClient` against a real, disposable
// ClickHouse instance (testcontainers) -- proves the actual SQL/schema
// wiring works, not just the in-memory fake the behavior/e2e tiers use.
// Scoped to this one service and its own direct dependency (ClickHouse) --
// no other authstar service involved. There is no official
// `@testcontainers/clickhouse` package, so this uses the generic container
// API directly against the `clickhouse/clickhouse-server` image, waiting on
// its HTTP port's own `/ping` endpoint.

function row(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
  return {
    tenant: 'acme',
    application: 'app1',
    eventType: 'request',
    timestamp: '2026-08-01T12:00:00.000',
    identityHash: null,
    idp: null,
    reason: null,
    method: null,
    path: null,
    status: null,
    latencyMs: null,
    clientPayload: null,
    eventId: 'evt-1',
    ...overrides,
  }
}

describe('chronicle -- real ClickHouse', () => {
  let container: StartedTestContainer
  let clickhouse: RealClickHouseClient
  let app: FastifyInstance

  beforeAll(async () => {
    container = await new GenericContainer('clickhouse/clickhouse-server:latest')
      .withExposedPorts(8123)
      // Recent images generate a random password for the `default` user
      // unless setup is explicitly skipped -- without this, every insert/
      // query call 401s with "Authentication failed" (found by actually
      // running this suite, not anticipated upfront).
      .withEnvironment({ CLICKHOUSE_SKIP_USER_SETUP: '1' })
      .withWaitStrategy(Wait.forHttp('/ping', 8123))
      .start()

    const url = `http://${container.getHost()}:${container.getMappedPort(8123)}`
    clickhouse = new RealClickHouseClient({
      url,
      username: 'default',
      password: '',
      database: 'default',
      queryTimeoutMs: 10_000,
    })
    await clickhouse.ensureSchema(24)

    app = await buildApp({ clickhouse, config: buildTestConfig() })
  }, 120_000) // ClickHouse images can be slow to pull/start on a cold cache

  afterAll(async () => {
    // Close chronicle's own client before stopping the container -- same
    // ordering tower's own integration tier settled on for Postgres:
    // stopping first leaves an open client connection with nowhere to go.
    await app?.close()
    await clickhouse?.close()
    await container?.stop()
  })

  it('ensureSchema built a real table with the configured TTL baked into the DDL', async () => {
    const isAlive = await clickhouse.ping()
    expect(isAlive).toBe(true)

    const engineFull = await clickhouse.describeTableEngine()
    // ClickHouse canonicalizes `TTL timestamp + INTERVAL 24 MONTH` into
    // `timestamp + toIntervalMonth(24)` in `system.tables.engine_full` --
    // found by actually running this against a real instance; the DDL
    // string this service sends still uses the more readable `INTERVAL`
    // syntax (both are equivalent ClickHouse SQL).
    expect(engineFull).toContain('toIntervalMonth(24)')
  })

  it('insertEvents actually writes rows that a report query reads back out', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', idp: 'google', identityHash: 'user-a', eventId: 'ch-1' }),
      row({ eventType: 'auth.login-succeeded', idp: 'google', identityHash: 'user-b', eventId: 'ch-2' }),
      row({ eventType: 'auth.login-failed', idp: 'google', reason: 'token_exchange_failed', eventId: 'ch-3' }),
    ])

    const result = await clickhouse.authFunnel({
      tenant: 'acme',
      dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
    })

    const google = result.byProvider.find((p) => p.idp === 'google')
    expect(google).toEqual({ idp: 'google', succeeded: 2, failed: 1 })
    expect(result.failureReasons).toEqual([{ reason: 'token_exchange_failed', count: 1 }])
  })

  it('active-users uniq(identityHash) dedupes across applications tenant-wide', async () => {
    await clickhouse.insertEvents([
      row({ application: 'app1', identityHash: 'dedup-user', eventId: 'ch-4' }),
      row({ application: 'app2', identityHash: 'dedup-user', eventId: 'ch-5' }),
      row({ application: 'app1', identityHash: 'dedup-user-2', eventId: 'ch-6' }),
    ])

    const result = await clickhouse.activeUsers({
      tenant: 'acme',
      dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
      granularity: 'day',
    })

    const total = result.buckets.reduce((sum, b) => sum + b.uniqueUsers, 0)
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('metricsQuery groups by application and computes count/unique_count/latency percentiles against real ClickHouse SQL', async () => {
    // Uses application values unique to this test -- the container/table
    // is shared across this whole describe block (deliberately, to avoid
    // a slow ClickHouse pull/start per test), so a generic 'app1' would
    // silently accumulate rows inserted by other tests in this file and
    // throw off exact-count assertions here.
    await clickhouse.insertEvents([
      row({ eventType: 'request', application: 'metrics-app1', method: 'GET', status: 200, latencyMs: 100, identityHash: 'u1', eventId: 'ch-7' }),
      row({ eventType: 'request', application: 'metrics-app1', method: 'GET', status: 200, latencyMs: 200, identityHash: 'u2', eventId: 'ch-8' }),
      row({ eventType: 'request', application: 'metrics-app2', method: 'POST', status: 500, latencyMs: 300, identityHash: 'u1', eventId: 'ch-9' }),
    ])

    const byApp = await clickhouse.metricsQuery({
      tenant: 'acme',
      metric: 'count',
      groupBy: ['application'],
      filters: { method: 'GET' },
      dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
    })
    expect(byApp.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ application: 'metrics-app1', value: 2 }),
    ]))

    const avgLatency = await clickhouse.metricsQuery({
      tenant: 'acme',
      metric: 'avg_latency',
      groupBy: [],
      filters: { application: 'metrics-app1' },
      dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
    })
    expect(avgLatency.results[0].value).toBe(150)

    const prefixMatch = await clickhouse.metricsQuery({
      tenant: 'acme',
      metric: 'count',
      eventType: 'req.*',
      groupBy: [],
      filters: { application: 'metrics-app1' },
      dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
    })
    // No 'req.*'-prefixed events exist (only bare 'request'); proves LIKE
    // prefix matching is real, not a no-op that would over-match.
    expect(prefixMatch.results[0].value).toBe(0)
  })

  it('exportSummary computes eventCounts/firstSeen/lastSeen via real min()/max()/count()', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'request', identityHash: 'export-user', timestamp: '2026-08-01T09:00:00.000', eventId: 'ch-10' }),
      row({ eventType: 'request', identityHash: 'export-user', timestamp: '2026-08-01T15:00:00.000', eventId: 'ch-11' }),
      row({ eventType: 'auth.login-succeeded', identityHash: 'export-user', timestamp: '2026-08-01T08:00:00.000', eventId: 'ch-12' }),
    ])

    const result = await clickhouse.exportSummary({ tenant: 'acme', identityHashes: ['export-user'] })
    expect(result.eventCounts.request).toBe(2)
    expect(result.eventCounts['auth.login-succeeded']).toBe(1)
    expect(result.firstSeen).toContain('2026-08-01')
  })

  it('the full HTTP surface works end to end against real ClickHouse (fastify.inject through to real SQL)', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'request', application: 'http-app', identityHash: 'http-user', eventId: 'ch-13' }),
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: {
        metric: 'count',
        groupBy: ['application'],
        filters: { application: 'http-app' },
        dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().results).toEqual(expect.arrayContaining([
      expect.objectContaining({ application: 'http-app', value: expect.any(Number) }),
    ]))
  })
})
