import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pino from 'pino'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import createAnalyticsMessageHandler from '../../src/consumer/message-handler.js'
import InMemoryClickHouseClient from '../lib/in-memory-clickhouse.js'
import FakeChannel, { fakeMessage } from '../lib/fake-channel.js'
import { buildTestConfig } from '../lib/test-config.js'
import { bearerHeader } from '../lib/jwt.js'

// End-to-end tier: a realistic sequence -- analytics events arrive on the
// (fake) broker, the consumer writes them into the (in-memory) ClickHouse
// fake, and the reporting API reads them back out over HTTP. Still no
// external dependencies (same fakes as the behavior tier), but this tier
// cares about the full round trip a real deployment actually exercises,
// not any one call's contract in isolation.

const silentLogger = pino({ level: 'silent' })

describe('events consumed off the broker are queryable through the reporting API', () => {
  let app: FastifyInstance
  let clickhouse: InMemoryClickHouseClient
  let channel: FakeChannel

  beforeEach(async () => {
    clickhouse = new InMemoryClickHouseClient()
    channel = new FakeChannel()
    app = await buildApp({ clickhouse, config: buildTestConfig() })
  })

  afterEach(async () => {
    await app.close()
  })

  it('a full auth funnel -- login attempts, a signup, an invite redemption -- flows from ingestion to the report', async () => {
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 100, batchMaxWaitMs: 5_000 })

    const baseFields = { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z' }

    // Two returning logins (one per provider) and one first-time signup.
    handler.handle('analytics.auth.login-succeeded', { ...baseFields, identityHash: 'user-a', idp: 'google' }, fakeMessage())
    handler.handle('analytics.auth.login-failed', { ...baseFields, identityHash: null, idp: 'google', reason: 'token_exchange_failed' }, fakeMessage())
    handler.handle('analytics.auth.login-succeeded', { ...baseFields, identityHash: 'user-b', idp: 'github' }, fakeMessage())
    handler.handle('analytics.auth.signup-completed', { ...baseFields, identityHash: 'user-b' }, fakeMessage())
    handler.handle('analytics.auth.invite-redeemed', { ...baseFields, identityHash: 'user-c' }, fakeMessage())

    await handler.flush()
    expect(clickhouse.allRows()).toHaveLength(5)

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(),
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const google = body.byProvider.find((p: { idp: string }) => p.idp === 'google')
    expect(google).toEqual({ idp: 'google', succeeded: 1, failed: 1 })
    expect(body.signupConversion).toEqual({ signups: 1, logins: 2, rate: 0.5 })
    expect(body.inviteRedemptions.count).toBe(1)
  })

  it('active-users dedupes a person who logged in from two applications, tenant-wide', async () => {
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 100, batchMaxWaitMs: 5_000 })

    handler.handle('analytics.request', {
      tenant: 'acme', application: 'app1', timestamp: '2026-08-01T09:00:00.000Z', identityHash: 'user-a', method: 'GET', path: '/x', status: 200, latencyMs: 10,
    }, fakeMessage())
    handler.handle('analytics.request', {
      tenant: 'acme', application: 'app2', timestamp: '2026-08-01T10:00:00.000Z', identityHash: 'user-a', method: 'GET', path: '/y', status: 200, latencyMs: 20,
    }, fakeMessage())
    handler.handle('analytics.request', {
      tenant: 'acme', application: 'app1', timestamp: '2026-08-01T11:00:00.000Z', identityHash: 'user-b', method: 'GET', path: '/z', status: 200, latencyMs: 30,
    }, fakeMessage())
    await handler.flush()

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/active-users?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&granularity=day',
      headers: await bearerHeader(),
    })

    expect(response.json().buckets).toEqual([{ bucket: expect.any(String), uniqueUsers: 2 }])
  })

  it('a malformed event dropped by the consumer never shows up in any report', async () => {
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 100, batchMaxWaitMs: 5_000 })

    const goodMessage = fakeMessage()
    const badMessage = fakeMessage()
    handler.handle('analytics.auth.login-succeeded', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z', identityHash: 'user-a', idp: 'google' }, goodMessage)
    handler.handle('analytics.auth.login-succeeded', { application: 'app1', timestamp: '2026-08-01T12:00:00.000Z' }, badMessage) // missing tenant
    await handler.flush()

    // The malformed message was acked (dropped, not retried) but never
    // reached ClickHouse -- the well-formed one was both inserted and acked.
    expect(channel.acked).toEqual(expect.arrayContaining([goodMessage, badMessage]))
    expect(clickhouse.allRows()).toHaveLength(1)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/query',
      headers: await bearerHeader(),
      payload: { metric: 'count', groupBy: [], dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' } },
    })
    expect(response.json().results).toEqual([{ value: 1 }])
  })

  it('a GDPR export-summary reflects exactly what was ingested for the given identityHashes', async () => {
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 100, batchMaxWaitMs: 5_000 })

    handler.handle('analytics.auth.login-succeeded', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T09:00:00.000Z', identityHash: 'user-a', idp: 'google' }, fakeMessage())
    handler.handle('analytics.request', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T10:00:00.000Z', identityHash: 'user-a', method: 'GET', path: '/x', status: 200, latencyMs: 5 }, fakeMessage())
    handler.handle('analytics.request', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T11:00:00.000Z', identityHash: 'user-other', method: 'GET', path: '/x', status: 200, latencyMs: 5 }, fakeMessage())
    await handler.flush()

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/analytics/export-summary',
      headers: await bearerHeader(),
      payload: { identityHashes: ['user-a'] },
    })

    expect(response.json()).toEqual({
      eventCounts: { 'auth.login-succeeded': 1, request: 1 },
      firstSeen: '2026-08-01T09:00:00.000Z',
      lastSeen: '2026-08-01T10:00:00.000Z',
    })
  })
})
