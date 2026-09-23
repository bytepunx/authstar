import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import InMemoryClickHouseClient from '../lib/in-memory-clickhouse.js'
import { buildTestConfig } from '../lib/test-config.js'
import { bearerHeader } from '../lib/jwt.js'
import type { AnalyticsEventRow } from '../../src/lib/types.js'

function row(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
  return {
    tenant: 'acme',
    application: 'app1',
    eventType: 'request',
    timestamp: '2026-08-01T12:00:00.000Z',
    identityHash: 'hash-1',
    idp: null,
    reason: null,
    method: 'GET',
    path: '/widgets',
    status: 200,
    latencyMs: 100,
    clientPayload: null,
    eventId: 'evt-1',
    ...overrides,
  }
}

const dateRange = { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' }

describe('POST /tenants/:tenantSlug/analytics/query', () => {
  let app: FastifyInstance
  let clickhouse: InMemoryClickHouseClient

  beforeEach(async () => {
    clickhouse = new InMemoryClickHouseClient()
    app = await buildApp({ clickhouse, config: buildTestConfig() })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects a request with no bearer token (401)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      payload: { metric: 'count', groupBy: [], dateRange },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a groupBy value outside the allowed vocabulary (400, not silently ignored)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: ['contactId'], dateRange },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a filters key outside the allowed vocabulary (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: [], filters: { identityHash: 'x' }, dateRange },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an unrecognized metric name (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'sum_latency', groupBy: [], dateRange },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a date range beyond the configured maximum (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: [], dateRange: { from: '2020-01-01T00:00:00Z', to: '2026-08-02T00:00:00Z' } },
    })
    expect(response.statusCode).toBe(400)
  })

  it('is rate limited per tenant (429 once the configured max is exceeded)', async () => {
    app = await buildApp({ clickhouse, config: buildTestConfig({ reporting: { ...buildTestConfig().reporting, rateLimit: { max: 2, windowMs: 60_000 } } }) })

    const makeRequest = async () => app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: [], dateRange },
    })

    expect((await makeRequest()).statusCode).toBe(200)
    expect((await makeRequest()).statusCode).toBe(200)
    expect((await makeRequest()).statusCode).toBe(429)
  })

  it('returns one row per unique groupBy combination, shaped for direct charting-library consumption', async () => {
    await clickhouse.insertEvents([
      row({ application: 'app1', eventId: '1' }),
      row({ application: 'app1', eventId: '2' }),
      row({ application: 'app2', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: ['application'], dateRange },
    })

    expect(response.statusCode).toBe(200)
    const results = response.json().results
    expect(results).toEqual(expect.arrayContaining([
      { application: 'app1', value: 2 },
      { application: 'app2', value: 1 },
    ]))
  })

  it('unique_count uses uniq(identityHash) semantics, deduping repeated identityHash values', async () => {
    await clickhouse.insertEvents([
      row({ identityHash: 'user-a', eventId: '1' }),
      row({ identityHash: 'user-a', eventId: '2' }),
      row({ identityHash: 'user-b', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'unique_count', groupBy: [], dateRange },
    })

    expect(response.json().results).toEqual([{ value: 2 }])
  })

  it('computes avg/p50/p95/p99 latency over latencyMs', async () => {
    await clickhouse.insertEvents([
      row({ latencyMs: 100, eventId: '1' }),
      row({ latencyMs: 200, eventId: '2' }),
      row({ latencyMs: 300, eventId: '3' }),
      row({ latencyMs: 400, eventId: '4' }),
    ])

    const avg = await app.inject({
      method: 'POST', url: '/tenants/acme/analytics/query', headers: await bearerHeader(),
      payload: { metric: 'avg_latency', groupBy: [], dateRange },
    })
    expect(avg.json().results[0].value).toBe(250)

    const p50 = await app.inject({
      method: 'POST', url: '/tenants/acme/analytics/query', headers: await bearerHeader(),
      payload: { metric: 'p50_latency', groupBy: [], dateRange },
    })
    expect(typeof p50.json().results[0].value).toBe('number')
  })

  it('matches an exact eventType', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', eventId: '1' }),
      row({ eventType: 'request', eventId: '2' }),
    ])

    const response = await app.inject({
      method: 'POST', url: '/tenants/acme/analytics/query', headers: await bearerHeader(),
      payload: { metric: 'count', eventType: 'auth.login-succeeded', groupBy: [], dateRange },
    })
    expect(response.json().results).toEqual([{ value: 1 }])
  })

  it('matches an "auth.*"-style prefix pattern across a whole event-type category', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', eventId: '1' }),
      row({ eventType: 'auth.login-failed', eventId: '2' }),
      row({ eventType: 'request', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'POST', url: '/tenants/acme/analytics/query', headers: await bearerHeader(),
      payload: { metric: 'count', eventType: 'auth.*', groupBy: [], dateRange },
    })
    expect(response.json().results).toEqual([{ value: 2 }])
  })

  it('applies application/status/method filters from the allowed vocabulary', async () => {
    await clickhouse.insertEvents([
      row({ application: 'app1', status: 200, method: 'GET', eventId: '1' }),
      row({ application: 'app1', status: 500, method: 'GET', eventId: '2' }),
      row({ application: 'app2', status: 200, method: 'POST', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'POST', url: '/tenants/acme/analytics/query', headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: [], filters: { application: 'app1', status: 200 }, dateRange },
    })
    expect(response.json().results).toEqual([{ value: 1 }])
  })
})
