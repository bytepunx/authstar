import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib'
import buildApp from '../../src/lib/build-app.js'
import { createAmqpPublisher, type ClosablePublisher } from '../../src/lib/amqp-publisher.js'
import type { FastifyInstance } from 'fastify'

// Integration tier: a real RabbitMQ (testcontainers), proving the actual
// publish call lands a real message on a real exchange/queue -- not just
// that the fake publisher recorded a call, which is all the behavior/e2e
// tiers can prove. Scoped to this one service and its own direct
// dependency (RabbitMQ), per this project's "single-service integration"
// convention (tower/TESTING.md).

const EXCHANGE = 'analytics'

describe('POST /events -- real RabbitMQ', () => {
  let container: StartedRabbitMQContainer
  let app: FastifyInstance
  let publisher: ClosablePublisher
  let consumerConnection: ChannelModel
  let consumerChannel: Channel

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3-management').start()
    const url = container.getAmqpUrl()

    publisher = await createAmqpPublisher({ url })
    app = await buildApp({ publisher })

    // A separate connection standing in for chronicle's real consumer --
    // proves messages actually land on a queue bound to the exchange
    // lookout publishes to, not merely that `channel.publish()` didn't
    // throw.
    consumerConnection = await amqplib.connect(url)
    consumerChannel = await consumerConnection.createChannel()
    await consumerChannel.assertExchange(EXCHANGE, 'topic', { durable: false })
  }, 60_000) // container pull + start can genuinely take a while on a cold image cache

  afterAll(async () => {
    await app.close()
    await consumerChannel.close()
    await consumerConnection.close()
    // Close the publisher's own channel/connection before stopping the
    // container -- stopping first leaves an open client connection with
    // nowhere to go and surfaces as a noisy uncaught exception, even though
    // the tests themselves already passed (mirrors tower's own
    // pgAdapters.close()-before-container.stop() convention, TESTING.md).
    await publisher.close()
    await container.stop()
  }, 60_000)

  async function bindQueue(routingPattern: string): Promise<string> {
    const { queue } = await consumerChannel.assertQueue('', { exclusive: true, autoDelete: true })
    await consumerChannel.bindQueue(queue, EXCHANGE, routingPattern)
    return queue
  }

  async function consumeOne(queue: string, timeoutMs = 5_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no message on ${queue} within ${timeoutMs}ms`)), timeoutMs)
      consumerChannel
        .consume(
          queue,
          (msg: ConsumeMessage | null) => {
            if (!msg) return
            clearTimeout(timer)
            consumerChannel.ack(msg)
            resolve(JSON.parse(msg.content.toString('utf8')))
          },
          { noAck: false },
        )
        .catch(reject)
    })
  }

  it('publishes a validated request event that a real bound queue actually receives', async () => {
    const queue = await bindQueue('analytics.request')

    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        tenant: 'acme',
        application: 'portal',
        eventType: 'request',
        method: 'GET',
        path: '/dashboard',
        status: 200,
        latencyMs: 8,
      },
    })

    expect(response.statusCode).toBe(202)
    const { eventId } = response.json()

    const received = await consumeOne(queue)
    expect(received.eventId).toBe(eventId)
    expect(received.tenant).toBe('acme')
    expect(received.method).toBe('GET')
    expect(received.status).toBe(200)
  })

  it('routes auth.* and client.* events to their own bound queues via the eventType-derived routing key', async () => {
    const authQueue = await bindQueue('analytics.auth.#')
    const clientQueue = await bindQueue('analytics.client.#')

    const authResponse = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { tenant: 'acme', application: 'portal', eventType: 'auth.login-succeeded', idp: 'google', identityHash: 'hash-1' },
    })
    const clientResponse = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { tenant: 'acme', application: 'portal', eventType: 'client.page-view', identityHash: 'hash-1', payload: { page: '/pricing' } },
    })

    expect(authResponse.statusCode).toBe(202)
    expect(clientResponse.statusCode).toBe(202)

    const authMessage = await consumeOne(authQueue)
    const clientMessage = await consumeOne(clientQueue)

    expect(authMessage.eventType).toBe('auth.login-succeeded')
    expect(authMessage.idp).toBe('google')
    expect(clientMessage.eventType).toBe('client.page-view')
    expect(clientMessage.payload).toEqual({ page: '/pricing' })
  })

  it('publishes onto a non-durable exchange -- the deliberate loss-tolerant trade-off ADR 0035 accepts for analytics traffic', async () => {
    // assertExchange with mismatched durability options throws if the
    // exchange already exists with different settings -- successfully
    // asserting `durable: false` again here (after the publisher already
    // created it in beforeAll) is itself proof the publisher created it
    // non-durable, not durable.
    await expect(consumerChannel.assertExchange(EXCHANGE, 'topic', { durable: false })).resolves.toBeDefined()
  })
})
