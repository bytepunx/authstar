import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import amqp, { type ChannelModel } from 'amqplib'
import pino from 'pino'
import buildConsumer, { type Consumer } from '../../src/consumer/build-consumer.js'
import InMemoryClickHouseClient from '../lib/in-memory-clickhouse.js'

// Bonus integration coverage (Story 001): the real amqplib wiring
// (`build-consumer.ts`) against a real, disposable RabbitMQ broker
// (testcontainers) -- proves the actual exchange/queue/binding topology
// and message flow work, not just the channel-agnostic handler logic the
// behavior tier already covers with a fake channel. Uses the in-memory
// `ClickHouseApi` fake here deliberately -- this test's job is proving the
// *broker* wiring, isolated from ClickHouse (already covered by its own
// integration suite); combining both real dependencies in one test would
// blur which one a failure actually points at.

const silentLogger = pino({ level: 'silent' })

describe('chronicle -- real RabbitMQ', () => {
  let container: StartedRabbitMQContainer
  let publisherConnection: ChannelModel
  let clickhouse: InMemoryClickHouseClient
  let consumer: Consumer

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start()
    publisherConnection = await amqp.connect(container.getAmqpUrl())

    clickhouse = new InMemoryClickHouseClient()
    consumer = await buildConsumer({
      url: container.getAmqpUrl(),
      clickhouse,
      logger: silentLogger,
      batchMaxSize: 100,
      batchMaxWaitMs: 500,
      exchange: 'analytics-test',
      queue: 'chronicle.analytics.test',
    })
  }, 90_000) // RabbitMQ image pull/start can be slow on a cold cache

  afterAll(async () => {
    // Close chronicle's own consumer (which closes its channel/connection)
    // before the publisher connection and the container, same ordering
    // discipline as the ClickHouse tier.
    await consumer?.close()
    await publisherConnection?.close()
    await container?.stop()
  })

  async function publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    const channel = await publisherConnection.createChannel()
    channel.publish('analytics-test', routingKey, Buffer.from(JSON.stringify(payload)))
    await channel.close()
  }

  async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  it('consumes a real message published to the analytics.# routing space and writes it into ClickHouse', async () => {
    await publish('analytics.request', {
      tenant: 'acme',
      application: 'app1',
      timestamp: '2026-08-01T12:00:00.000Z',
      identityHash: 'user-a',
      method: 'GET',
      path: '/widgets',
      status: 200,
      latencyMs: 12,
    })

    await waitUntil(() => clickhouse.allRows().length >= 1)

    const row = clickhouse.allRows()[0]
    expect(row.tenant).toBe('acme')
    expect(row.eventType).toBe('request')
    expect(row.method).toBe('GET')
  })

  it('one binding covers the whole analytics.# space -- auth and client routing keys both land in the same table', async () => {
    const before = clickhouse.allRows().length

    await publish('analytics.auth.login-succeeded', {
      tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z', identityHash: 'user-b', idp: 'google',
    })
    await publish('analytics.client.pageview', {
      tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:00.000Z', page: '/pricing',
    })

    await waitUntil(() => clickhouse.allRows().length >= before + 2)

    const eventTypes = clickhouse.allRows().slice(before).map((r) => r.eventType).sort()
    expect(eventTypes).toEqual(['auth.login-succeeded', 'client.pageview'])
  })

  it('a malformed message is dropped, not redelivered forever -- the broker queue drains to empty', async () => {
    const before = clickhouse.allRows().length

    await publish('analytics.request', { application: 'app1', timestamp: '2026-08-01T12:00:00.000Z' }) // missing tenant
    await publish('analytics.request', { tenant: 'acme', application: 'app1', timestamp: '2026-08-01T12:00:01.000Z' }) // well-formed, follows it

    await waitUntil(() => clickhouse.allRows().length >= before + 1)

    // Only the well-formed message was written -- the malformed one was
    // acked and dropped, not stuck retrying and blocking what came after it.
    expect(clickhouse.allRows().length).toBe(before + 1)
  })
})
