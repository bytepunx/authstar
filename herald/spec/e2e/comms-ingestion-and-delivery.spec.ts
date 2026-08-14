import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import { startCommsConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/comms-consumer.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// End-to-end tier: the full RabbitMQ-shaped ingestion path (Story 002),
// simulated behind a fake `ChannelLike` (no real broker -- per this
// project's scope, testing the worker's consume/ack/nack sequencing is
// sufficient, a real amqplib/RabbitMQ integration test is a bonus this
// slice doesn't include, see TESTING.md), through to a real send and the
// communication showing up correctly in the HTTP history routes. This is
// the realistic end-to-end sequence a production message would actually
// travel: publisher encrypts -> RabbitMQ delivers -> herald ingests
// (creates the durable `communication` record, which is what the message
// acks on) -> herald dispatches -> caller reads the result back over HTTP.

class FakeChannel implements ChannelLike {
  private handler: ((msg: ConsumedMessage | null) => void) | null = null
  public acked: ConsumedMessage[] = []
  public nacked: Array<{ msg: ConsumedMessage, requeue: boolean }> = []

  consume(_queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown> {
    this.handler = onMessage
    return Promise.resolve()
  }

  ack(msg: ConsumedMessage): void {
    this.acked.push(msg)
  }

  nack(msg: ConsumedMessage, _allUpTo: boolean, requeue: boolean): void {
    this.nacked.push({ msg, requeue })
  }

  async deliver(payload: unknown): Promise<void> {
    await this.deliverRaw(Buffer.from(JSON.stringify(payload)))
  }

  async deliverRaw(content: Buffer): Promise<void> {
    if (!this.handler) throw new Error('no consumer registered')
    this.handler({ content })
    // ack/nack happen inside an unawaited `.then()` chain in the real
    // consumer (mirrors a real amqplib callback, which is also not
    // awaitable) -- yield a tick so it has a chance to settle before
    // assertions run.
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('comms ingestion -> send -> history, end to end', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let adapter: FakeSendAdapter
  let channel: FakeChannel
  let jwt: InternalJwtFixture
  let manageHeaders: { authorization: string }
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'provider-msg-1' }])
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, payloadKeyring, adapterFor: () => adapter, authstarGetKey: jwt.getKey })
    manageHeaders = bearer(await jwt.signToken({ permissions: ['communication-types:manage'] }))
    readHeaders = bearer(await jwt.signToken({ permissions: ['communications:read'] }))
    channel = new FakeChannel()
    await startCommsConsumer(channel, 'comms.queue', app.sendWorkerDeps)
  })

  afterEach(async () => {
    await app.close()
  })

  it('a published message is ingested, sent, acked, and readable via the history routes', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    const idempotencyKey = uniqueSlug('idem')
    const contactId = uniqueSlug('contact')

    // Setup a publisher would have already done (communication type +
    // template exist ahead of time) -- via the real HTTP routes, since
    // those exist in this slice.
    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    await app.inject({
      headers: manageHeaders,
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/${type}/templates`,
      payload: { subjectTemplate: 'Welcome {{name}}', bodyTemplate: 'Hi {{name}}, enjoy!' },
    })

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'newuser@example.com', { name: 'Grace' })

    await channel.deliver({
      idempotencyKey, tenant, application: 'app1', contactId,
      category: 'transactional', type, title: 'Welcome email',
      templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    expect(channel.acked).toHaveLength(1)
    expect(channel.nacked).toHaveLength(0)
    expect(adapter.sent).toHaveLength(1)
    expect(adapter.sent[0].subject).toBe('Welcome Grace')

    const detail = await app.inject({ headers: readHeaders, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().status).toBe('sent')

    const rendered = await app.inject({ headers: readHeaders, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}/render` })
    expect(rendered.json().body).toBe('Hi Grace, enjoy!')
  })

  it('a redelivered message with the same idempotencyKey is a safe no-op, not a duplicate send', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    const idempotencyKey = uniqueSlug('idem')
    const contactId = uniqueSlug('contact')

    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'Hi {{name}}', bodyTemplate: 'Body' } })

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', { name: 'Ada' })
    const message = { idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type, title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email' }

    await channel.deliver(message)
    await channel.deliver(message) // redelivery -- same idempotencyKey

    expect(channel.acked).toHaveLength(2) // both acked -- redelivery is not an error
    expect(adapter.sent).toHaveLength(1) // only sent once
  })

  it('a malformed message is nacked without requeue (dead-lettered, not retried forever)', async () => {
    await channel.deliverRaw(Buffer.from('{not valid json'))

    expect(channel.nacked).toHaveLength(1)
    expect(channel.nacked[0].requeue).toBe(false)
    expect(channel.acked).toHaveLength(0)
  })
})
