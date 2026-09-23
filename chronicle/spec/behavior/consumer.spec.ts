import { describe, expect, it, vi } from 'vitest'
import pino from 'pino'
import createAnalyticsMessageHandler from '../../src/consumer/message-handler.js'
import InMemoryClickHouseClient from '../lib/in-memory-clickhouse.js'
import FakeChannel, { fakeMessage } from '../lib/fake-channel.js'

// Behavior tier for Story 001's consumer: the channel-agnostic message
// handler tested against a fake channel/message and the in-memory
// `ClickHouseApi` fake -- asserting correct insert calls and ack/nack
// decisions, no real broker or ClickHouse involved.

const silentLogger = pino({ level: 'silent' })

describe('analytics message handler -- mapping, batching, ack/nack', () => {
  it('maps a request event onto the row shape and batches it (no insert until flush)', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 250, batchMaxWaitMs: 5_000 })

    const message = fakeMessage()
    handler.handle('analytics.request', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
      identityHash: 'hash-1',
      method: 'GET',
      path: '/widgets',
      status: 200,
      latencyMs: 42,
    }, message)

    expect(clickhouse.allRows()).toHaveLength(0) // not flushed yet
    expect(channel.acked).toHaveLength(0)

    await handler.flush()

    expect(clickhouse.allRows()).toHaveLength(1)
    const row = clickhouse.allRows()[0]
    expect(row.eventType).toBe('request')
    expect(row.tenant).toBe('acme')
    expect(row.method).toBe('GET')
    expect(row.status).toBe(200)
    // Auth-only fields are null, not zero-valued/empty-string, on a
    // request event (Story 001's own framing).
    expect(row.idp).toBeNull()
    expect(row.reason).toBeNull()
    expect(channel.acked).toEqual([message])
  })

  it('maps an auth.login-failed event, leaving request-only fields null', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 1, batchMaxWaitMs: 5_000 })

    handler.handle('analytics.auth.login-failed', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
      identityHash: null,
      idp: 'google',
      reason: 'token_exchange_failed',
    }, fakeMessage())

    // batchMaxSize: 1 -- flushes synchronously-ish via the microtask queue.
    await new Promise((resolve) => setImmediate(resolve))

    expect(clickhouse.allRows()).toHaveLength(1)
    const row = clickhouse.allRows()[0]
    expect(row.eventType).toBe('auth.login-failed')
    expect(row.idp).toBe('google')
    expect(row.reason).toBe('token_exchange_failed')
    expect(row.method).toBeNull()
    expect(row.path).toBeNull()
    expect(row.status).toBeNull()
  })

  it('strips the "analytics." prefix, namespaces client events under client.<type>, and stores only the nested payload sub-object', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 1, batchMaxWaitMs: 5_000 })

    // Real lookout wire shape (lookout/src/routes/events.ts: `{...body,
    // eventId, timestamp}`) -- the client's own data is nested under
    // `payload`, alongside tenant/application/eventType/etc., not flat at
    // the top level.
    handler.handle('analytics.client.pageview', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
      payload: { page: '/pricing' },
    }, fakeMessage())
    await new Promise((resolve) => setImmediate(resolve))

    const row = clickhouse.allRows()[0]
    expect(row.eventType).toBe('client.pageview')
    // Only the nested payload, not the whole envelope -- tenant/application/
    // timestamp are already their own columns and shouldn't be duplicated
    // inside the JSON blob too (ADR 0085's `clientPayload.<field>` query
    // assumption depends on this).
    expect(row.clientPayload).toBe(JSON.stringify({ page: '/pricing' }))
  })

  it('stores null clientPayload for a client event with no payload sub-object', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 1, batchMaxWaitMs: 5_000 })

    handler.handle('analytics.client.pageview', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
    }, fakeMessage())
    await new Promise((resolve) => setImmediate(resolve))

    expect(clickhouse.allRows()[0].clientPayload).toBeNull()
  })

  it('drops (acks, does not insert) a message missing a required always-present field', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger })

    const message = fakeMessage()
    handler.handle('analytics.request', {
      // tenant missing
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
    }, message)
    await handler.flush()

    expect(clickhouse.allRows()).toHaveLength(0)
    expect(channel.acked).toEqual([message]) // dropped, not retried -- acked so it isn't redelivered
  })

  it('drops (acks) a message with an eventType chronicle does not recognize', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger })

    const message = fakeMessage()
    handler.handle('analytics.auth.something-unknown', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
    }, message)
    await handler.flush()

    expect(clickhouse.allRows()).toHaveLength(0)
    expect(channel.acked).toEqual([message])
  })

  it('does not dedup a redelivered message -- inserted again, no idempotency check', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger })

    const payload = {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
      eventId: 'same-event-id',
    }
    handler.handle('analytics.request', payload, fakeMessage())
    handler.handle('analytics.request', payload, fakeMessage())
    await handler.flush()

    expect(clickhouse.allRows()).toHaveLength(2)
  })

  it('flushes once maxSize is reached, without waiting for the timer', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 3, batchMaxWaitMs: 60_000 })

    for (let i = 0; i < 3; i += 1) {
      handler.handle('analytics.request', {
        tenant: 'acme',
        application: 'app1',
        timestamp: '2026-08-01T12:00:00.000Z',
      }, fakeMessage())
    }
    await new Promise((resolve) => setImmediate(resolve))

    expect(clickhouse.allRows()).toHaveLength(3)
  })

  it('nacks the whole batch without requeue on an insert failure, and logs it', async () => {
    const clickhouse = new InMemoryClickHouseClient()
    vi.spyOn(clickhouse, 'insertEvents').mockRejectedValueOnce(new Error('clickhouse unavailable'))
    const channel = new FakeChannel()
    const handler = createAnalyticsMessageHandler({ clickhouse, channel, logger: silentLogger, batchMaxSize: 2, batchMaxWaitMs: 60_000 })

    const m1 = fakeMessage()
    const m2 = fakeMessage()
    handler.handle('analytics.request', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z' }, m1)
    handler.handle('analytics.request', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z' }, m2)
    await new Promise((resolve) => setImmediate(resolve))

    expect(channel.acked).toHaveLength(0)
    expect(channel.nacked).toHaveLength(2)
    expect(channel.nacked.every((n) => n.requeue === false)).toBe(true)
  })
})
