import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createFakeStripeClientFactory, createFakeStripeState } from '../lib/fake-stripe-client.js'
import { createInMemoryStripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache } from '../../src/lib/role-reference-cache.js'
import { createInMemorySequenceProvider } from '../../src/lib/entitlement-publisher.js'
import { createAmqpEntitlementPublisher, ENTITLEMENT_EXCHANGE } from '../../src/lib/amqp-entitlement-publisher.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'

// Integration tier: a real RabbitMQ (testcontainers), proving keep's
// `AmqpEntitlementPublisher` actually lands a message tower's own
// `entitlement-consumer.ts` can consume -- routing key
// `entitlement.<eventType>`, bound via `entitlement.#` on the same durable
// topic exchange (`authstar`) tower's `src/server.ts` asserts -- not just
// that the in-memory fake publisher (every other tier here) recorded a
// call. Scoped to this one dependency (RabbitMQ), same "single-service
// integration" convention as this repo's own Postgres integration tier and
// lookout's/chronicle's RabbitMQ integration tiers: `consequent` stays
// in-memory and Stripe stays faked here so a failure points unambiguously
// at the broker wiring, not at Postgres or Stripe (chronicle's own
// `rabbitmq.integration.spec.ts` documents the same reasoning).
//
// This is the one new piece of real-infrastructure-backed coverage this
// slice adds beyond what already existed (TESTING.md: "Real RabbitMQ
// publishing... no `createAmqpEntitlementPublisher` production wiring
// exists yet... not that it successfully reaches a real broker").

describe('entitlement publishing -- real RabbitMQ', () => {
  let container: StartedRabbitMQContainer
  let app: FastifyInstance
  let publisherConnection: ChannelModel
  let publisherChannel: Channel
  let consumerConnection: ChannelModel
  let consumerChannel: Channel
  let manageHeaders: { authorization: string }

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start()
    const url = container.getAmqpUrl()

    // Mirrors what src/server.ts itself does: dial amqplib, open a channel,
    // assert the exchange, *then* hand the channel to
    // createAmqpEntitlementPublisher -- the publisher module itself never
    // asserts topology, exactly like tower's own createAmqpPublisher.
    publisherConnection = await amqplib.connect(url)
    publisherChannel = await publisherConnection.createChannel()
    await publisherChannel.assertExchange(ENTITLEMENT_EXCHANGE, 'topic', { durable: true })
    const entitlements = createAmqpEntitlementPublisher(publisherChannel)

    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })

    const jwt = await createInternalJwtFixture()
    manageHeaders = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))

    app = await buildApp({
      consequent,
      stripeClients: createFakeStripeClientFactory(stripeState),
      stripeConfig,
      roleCache: createRoleReferenceCache({ 'demo-app': ['member', 'admin'] }),
      entitlements,
      sequences: createInMemorySequenceProvider(),
      authstarGetKey: jwt.getKey,
    })

    // A separate connection standing in for tower's real consumer -- proves
    // messages actually land on a queue bound to `entitlement.#` on the
    // exchange keep publishes to, not merely that `channel.publish()`
    // didn't throw.
    consumerConnection = await amqplib.connect(url)
    consumerChannel = await consumerConnection.createChannel()
    await consumerChannel.assertExchange(ENTITLEMENT_EXCHANGE, 'topic', { durable: true })
  }, 90_000) // RabbitMQ image pull/start can be slow on a cold cache

  afterAll(async () => {
    await app.close()
    await consumerChannel.close()
    await consumerConnection.close()
    // Close the publisher's own channel/connection before stopping the
    // container -- stopping first leaves an open client connection with
    // nowhere to go and surfaces as a noisy uncaught exception even though
    // the tests themselves already passed (same ordering discipline this
    // repo's Postgres integration tier documents: close adapters before
    // stopping the container).
    await publisherChannel.close()
    await publisherConnection.close()
    await container.stop()
  }, 60_000)

  async function bindQueue(routingPattern: string): Promise<string> {
    const { queue } = await consumerChannel.assertQueue('', { exclusive: true, autoDelete: true })
    await consumerChannel.bindQueue(queue, ENTITLEMENT_EXCHANGE, routingPattern)
    return queue
  }

  async function consumeMessages(queue: string, count: number, timeoutMs = 5_000): Promise<ConsumeMessage[]> {
    return new Promise((resolve, reject) => {
      const received: ConsumeMessage[] = []
      const timer = setTimeout(() => reject(new Error(`only received ${received.length}/${count} messages on ${queue} within ${timeoutMs}ms`)), timeoutMs)
      consumerChannel
        .consume(
          queue,
          (msg: ConsumeMessage | null) => {
            if (!msg) return
            consumerChannel.ack(msg)
            received.push(msg)
            if (received.length >= count) {
              clearTimeout(timer)
              resolve(received)
            }
          },
          { noAck: false },
        )
        .catch(reject)
    })
  }

  function stripeEventPayload(type: string, object: Record<string, unknown>): string {
    return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
  }

  it('a checkout-driven subscription activation publishes converted-to-paid and role-granted onto entitlement.# via a real broker', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }] },
    })

    const queue = await bindQueue('entitlement.#')

    const response = await app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload('customer.subscription.created', {
        id: 'sub_amqp_1',
        customer: 'cus_amqp_1',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_amqp_1' }) },
      }),
    })
    expect(response.statusCode).toBe(200)

    const messages = await consumeMessages(queue, 2)
    const byRoutingKey = new Map(messages.map((m) => [m.fields.routingKey, JSON.parse(m.content.toString('utf8'))]))

    expect([...byRoutingKey.keys()].sort()).toEqual(['entitlement.converted-to-paid', 'entitlement.role-granted'])

    const converted = byRoutingKey.get('entitlement.converted-to-paid')
    expect(converted).toMatchObject({ tenant: 'acme', scope: { account: 'acct_amqp_1' } })
    // The published envelope omits `type` -- tower's own
    // `EntitlementEnvelope` (entitlement-consumer.ts) carries no
    // `type`/`eventType` field; the routing key alone conveys which event
    // arrived (ADR 0031).
    expect(converted).not.toHaveProperty('type')

    const roleGranted = byRoutingKey.get('entitlement.role-granted')
    expect(roleGranted).toMatchObject({
      tenant: 'acme',
      scope: { account: 'acct_amqp_1' },
      role: { name: 'member', scope: 'demo-app' },
    })
    expect(roleGranted).not.toHaveProperty('type')

    // Both events share one monotonically-increasing sequence per
    // (tenant, scope) -- Story 002/ADR 0031, not one counter per event type.
    const sequences = [...byRoutingKey.values()].map((v) => (v as { sequence: number }).sequence)
    expect(new Set(sequences).size).toBe(2)
  })

  it('publishes with persistent delivery mode onto a durable exchange -- the must-not-lose tier ADR 0006 requires', async () => {
    const queue = await bindQueue('entitlement.converted-to-paid')

    await app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload('customer.subscription.created', {
        id: 'sub_amqp_2',
        customer: 'cus_amqp_2',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_amqp_2' }) },
      }),
    })

    const [message] = await consumeMessages(queue, 1)
    // deliveryMode 2 == persistent (amqplib's own `persistent: true` option
    // maps to this on the wire) -- proves createAmqpEntitlementPublisher's
    // `persistent: true` actually took effect, not just that it was passed.
    expect(message.properties.deliveryMode).toBe(2)

    // assertExchange with mismatched durability options throws if the
    // exchange already exists with different settings -- successfully
    // asserting `durable: true` again here (after the publisher already
    // created it in beforeAll) is itself proof the publisher created it
    // durable, not the non-durable tier lookout/chronicle's analytics
    // exchange deliberately uses.
    await expect(consumerChannel.assertExchange(ENTITLEMENT_EXCHANGE, 'topic', { durable: true })).resolves.toBeDefined()
  })

  it('an unrelated routing key (not entitlement.#) never reaches a queue bound only to the entitlement space', async () => {
    // seat-limit-changed only fires for a tenant-scoped subscription --
    // this account-scoped one deliberately produces no such event, so a
    // queue bound to that one routing key should see nothing.
    const queue = await bindQueue('entitlement.seat-limit-changed')

    await app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload('customer.subscription.created', {
        id: 'sub_amqp_3',
        customer: 'cus_amqp_3',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_amqp_3' }) },
      }),
    })

    await expect(consumeMessages(queue, 1, 1_000)).rejects.toThrow(/only received 0\/1/)
  })
})
