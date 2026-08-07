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

describe('POST /tenants/:tenantSlug/analytics/export-summary', () => {
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
      url: '/tenants/acme/analytics/export-summary',
      payload: { identityHashes: ['hash-1'] },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects an unknown top-level field (400, additionalProperties: false actually enforced)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/export-summary',
      headers: await bearerHeader(),
      payload: { identityHashes: ['hash-1'], contactId: 'nope' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns a deliberate summary, not a raw event dump: counts by eventType, firstSeen/lastSeen', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', identityHash: 'hash-1', timestamp: '2026-08-01T10:00:00.000Z', eventId: '1' }),
      row({ eventType: 'request', identityHash: 'hash-1', timestamp: '2026-08-01T11:00:00.000Z', eventId: '2' }),
      row({ eventType: 'request', identityHash: 'hash-1', timestamp: '2026-08-01T12:00:00.000Z', eventId: '3' }),
      // A different identityHash -- must not be included.
      row({ eventType: 'request', identityHash: 'hash-2', timestamp: '2026-08-01T13:00:00.000Z', eventId: '4' }),
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/export-summary',
      headers: await bearerHeader(),
      payload: { identityHashes: ['hash-1'] },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.eventCounts).toEqual({ 'auth.login-succeeded': 1, request: 2 })
    expect(body.firstSeen).toBe('2026-08-01T10:00:00.000Z')
    expect(body.lastSeen).toBe('2026-08-01T12:00:00.000Z')
  })

  it('resolves across multiple identityHashes in one call', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'request', identityHash: 'hash-1', eventId: '1' }),
      row({ eventType: 'request', identityHash: 'hash-2', eventId: '2' }),
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/export-summary',
      headers: await bearerHeader(),
      payload: { identityHashes: ['hash-1', 'hash-2'] },
    })

    expect(response.json().eventCounts).toEqual({ request: 2 })
  })

  it('returns an empty summary, not an error, for identityHashes with no matching events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/export-summary',
      headers: await bearerHeader(),
      payload: { identityHashes: ['unknown-hash'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ eventCounts: {}, firstSeen: null, lastSeen: null })
  })
})
