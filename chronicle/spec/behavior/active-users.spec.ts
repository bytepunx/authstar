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
    method: null,
    path: null,
    status: null,
    latencyMs: null,
    clientPayload: null,
    eventId: 'evt-1',
    ...overrides,
  }
}

describe('GET /tenants/:tenantSlug/analytics/reports/active-users', () => {
  let app: FastifyInstance
  let clickhouse: InMemoryClickHouseClient

  beforeEach(async () => {
    clickhouse = new InMemoryClickHouseClient()
    app = await buildApp({ clickhouse, config: buildTestConfig() })
  })

  afterEach(async () => {
    await app.close()
  })

  it('requires a granularity query param (400 without one)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(),
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a granularity value outside day/week/month (400)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&granularity=hour',
      headers: await bearerHeader(),
    })
    expect(response.statusCode).toBe(400)
  })

  it('omitted application dedupes tenant-wide across applications sharing an identityHash', async () => {
    await clickhouse.insertEvents([
      row({ application: 'app1', identityHash: 'user-a', eventId: '1' }),
      row({ application: 'app2', identityHash: 'user-a', eventId: '2' }), // same person, different app
      row({ application: 'app1', identityHash: 'user-b', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&granularity=day',
      headers: await bearerHeader(),
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.buckets).toHaveLength(1)
    expect(body.buckets[0].uniqueUsers).toBe(2) // user-a deduped across app1/app2, plus user-b
  })

  it('a specified application scopes the same dedup logic to just that product', async () => {
    await clickhouse.insertEvents([
      row({ application: 'app1', identityHash: 'user-a', eventId: '1' }),
      row({ application: 'app2', identityHash: 'user-a', eventId: '2' }),
      row({ application: 'app1', identityHash: 'user-b', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&granularity=day&application=app1',
      headers: await bearerHeader(),
    })

    expect(response.json().buckets[0].uniqueUsers).toBe(2) // user-a and user-b, both in app1
  })

  it('buckets by the requested granularity', async () => {
    await clickhouse.insertEvents([
      row({ timestamp: '2026-08-01T01:00:00.000Z', identityHash: 'user-a', eventId: '1' }),
      row({ timestamp: '2026-08-01T23:00:00.000Z', identityHash: 'user-b', eventId: '2' }),
      row({ timestamp: '2026-08-02T01:00:00.000Z', identityHash: 'user-c', eventId: '3' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-03T00:00:00Z&granularity=day',
      headers: await bearerHeader(),
    })

    const body = response.json()
    expect(body.buckets).toHaveLength(2) // Aug 1 (2 users) and Aug 2 (1 user)
    const totals = body.buckets.map((b: { uniqueUsers: number }) => b.uniqueUsers).sort()
    expect(totals).toEqual([1, 2])
  })
})
