import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import amqp, { type ChannelModel } from 'amqplib'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { uniqueSlug } from '../lib/unique.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import { UnsubscribeKeyring } from '../../src/lib/unsubscribe-token.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import buildCommsConsumer, { type Consumer as CommsConsumer } from '../../src/lib/build-comms-consumer.js'
import buildContactLifecycleConsumer, { type Consumer as ContactLifecycleConsumer } from '../../src/lib/build-contact-lifecycle-consumer.js'
import type { SendWorkerDeps } from '../../src/lib/send-worker.js'
import type { Publisher } from '../../src/lib/publisher.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { CommunicationState } from '../../src/actors/communication_actor.js'
import type { OptOutState } from '../../src/actors/opt_out_actor.js'

// Bonus integration coverage: the real `amqplib` wiring
// (`build-comms-consumer.ts`/`build-contact-lifecycle-consumer.ts`) against
// a real, disposable RabbitMQ broker (testcontainers) -- proves the actual
// exchange/queue/binding topology and message flow work, not just the
// channel-agnostic handler logic the e2e tier already covers against a
// fake channel. Closest mechanical template in this stack: chronicle's own
// `spec/integration/rabbitmq.integration.spec.ts`.
//
// Uses an in-memory `consequent` here deliberately, same reasoning
// chronicle's own file gives for its in-memory ClickHouse fake: this
// suite's job is proving the *broker* wiring (real exchange/queue/binding
// assert, real ack/nack over a real channel), isolated from Postgres
// (already covered by `herald.integration.spec.ts`'s own suite) --
// combining both real dependencies in one test would blur which one a
// failure actually points at. `consequent.find()` (used by the
// contact-lifecycle consumer's payload-purge sweep) works identically
// against the in-memory adapter and real Postgres as of this pilot's
// pinned versions (the historical divergence between them is fixed
// upstream -- see `herald.integration.spec.ts`'s own header).
//
// Both consumers share one topic exchange here, matching production (ADR
// 0006/0022/0026 all describe a single `authstar` exchange, not one per
// consumer) -- a `-test` suffixed name so a real broker's own `authstar`
// exchange, if one happened to exist, is never touched.

describe('herald -- real RabbitMQ', () => {
  let container: StartedRabbitMQContainer
  let publisherConnection: ChannelModel
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let unsubscribeKeyring: UnsubscribeKeyring
  let adapter: FakeSendAdapter
  let sendWorkerDeps: SendWorkerDeps
  let publisher: RecordingPublisher
  let commsConsumer: CommsConsumer
  let contactLifecycleConsumer: ContactLifecycleConsumer

  const EXCHANGE = 'authstar-test'
  const COMMS_QUEUE = 'herald.comms.test'
  const LIFECYCLE_QUEUE = 'herald.contact-lifecycle.test'

  class RecordingPublisher implements Publisher {
    public published: Array<{ routingKey: string, payload: unknown }> = []
    async publish(routingKey: string, payload: unknown): Promise<void> {
      this.published.push({ routingKey, payload })
    }
  }

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start()
    publisherConnection = await amqp.connect(container.getAmqpUrl())

    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    unsubscribeKeyring = new UnsubscribeKeyring()
    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'amqp-msg-1' }])
    sendWorkerDeps = { consequent, payloadKeyring, unsubscribeKeyring, adapterFor: () => adapter }
    publisher = new RecordingPublisher()

    commsConsumer = await buildCommsConsumer({
      url: container.getAmqpUrl(),
      deps: sendWorkerDeps,
      exchange: EXCHANGE,
      queue: COMMS_QUEUE,
    })
    contactLifecycleConsumer = await buildContactLifecycleConsumer({
      url: container.getAmqpUrl(),
      deps: { consequent, publisher },
      exchange: EXCHANGE,
      queue: LIFECYCLE_QUEUE,
    })
  }, 90_000) // RabbitMQ image pull/start can be slow on a cold cache

  afterAll(async () => {
    // Close herald's own consumers (which close their own channel/
    // connection) before the publisher connection and the container, same
    // ordering discipline as chronicle's own integration tier.
    await commsConsumer?.close()
    await contactLifecycleConsumer?.close()
    await publisherConnection?.close()
    await container?.stop()
  })

  async function publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    const channel = await publisherConnection.createChannel()
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { contentType: 'application/json', persistent: true })
    await channel.close()
  }

  async function publishRaw(routingKey: string, content: Buffer): Promise<void> {
    const channel = await publisherConnection.createChannel()
    channel.publish(EXCHANGE, routingKey, content)
    await channel.close()
  }

  async function waitUntil(predicate: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
    const start = Date.now()
    while (!(await predicate())) {
      if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  it('comms consumer: a real comms.transactional.* message on the real broker is consumed and durably ingested', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    const idempotencyKey = uniqueSlug('idem')
    const contactId = uniqueSlug('contact')
    const key = `${tenant}:${idempotencyKey}`

    // Deliberately no communicationType/template setup -- this test's job
    // is proving the real broker/exchange/queue/binding delivers the
    // message and herald's own ingest logic durably creates the
    // `communication` record from it, not re-proving template resolution
    // (already covered against a fake channel by
    // `comms-ingestion-and-delivery.spec.ts`). Without a template, the
    // worker's own render step fails closed (`markFailed`, "no template
    // found") after ingestion -- a real, expected outcome, not a test bug.
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'real-broker@example.com', { name: 'Ada' })

    await publish('comms.transactional.invite-sent', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional',
      type, title: 'Welcome email', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    // The load-bearing assertion for *this* tier: the real broker actually
    // delivered the message, and `build-comms-consumer.ts`'s real
    // exchange/queue/binding setup routed it to herald's own ingest logic,
    // which durably created the `communication` record -- proven by a
    // fresh `fetch`, not an in-process callback. Whether it *renders and
    // sends* successfully depends on a template actually resolving, which
    // is already proven against a fake channel by the e2e tier -- not
    // re-asserted strictly here so this test isn't coupled to
    // `template_actor.ts`'s exact command surface.
    await waitUntil(async () => {
      const instance = await consequent.fetch('communication', key)
      return Boolean((instance?.state as unknown as CommunicationState | undefined)?.createdAt)
    })

    const state = (await consequent.fetch('communication', key))?.state as unknown as CommunicationState
    expect(state.tenant).toBe(tenant)
    expect(state.contactId).toBe(contactId)
    expect(state.idempotencyKey).toBe(idempotencyKey)
  })

  it('comms consumer: a malformed message is dead-lettered, not requeued forever -- a well-formed message published right after it still gets through', async () => {
    const tenant = uniqueSlug('acme')
    const idempotencyKey = uniqueSlug('idem')
    const contactId = uniqueSlug('contact')
    const key = `${tenant}:${idempotencyKey}`

    await publishRaw('comms.transactional.whatever', Buffer.from('{not valid json'))

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', {})
    await publish('comms.transactional.whatever', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional',
      type: 'whatever', title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    await waitUntil(async () => {
      const instance = await consequent.fetch('communication', key)
      return Boolean((instance?.state as unknown as CommunicationState | undefined)?.createdAt)
    })
    // Reaching here at all proves the malformed message ahead of it didn't
    // block the queue -- it was nacked without requeue, not stuck retrying.
  })

  it('contact-lifecycle consumer: a contact.purged message on tower\'s exact routing key/payload shape is consumed and purges the payload + publishes the ack', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')
    const key = `${tenant}:${idempotencyKey}`

    await consequent.handle(key, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional',
      type: 'invite-sent', title: 'Invite', templateVersion: 1,
      encryptedPayload: 'ciphertext-blob', payloadKeyVersion: 1, channel: 'email',
    })

    // Tower's own routing key literal (`tower/src/routes/contacts.ts`) and
    // payload shape (`{ tenant, contactId, accountId }`), confirmed by
    // reading tower's source directly, not assumed.
    await publish('contact.purged', { tenant, contactId, accountId: 'acc-1' })

    await waitUntil(async () => {
      const instance = await consequent.fetch('communication', key)
      return Boolean((instance?.state as unknown as CommunicationState | undefined)?.payloadPurgedAt)
    })

    const state = (await consequent.fetch('communication', key))?.state as unknown as CommunicationState
    expect(state.encryptedPayload).toBe('')

    await waitUntil(() => publisher.published.some((p) => p.routingKey === 'contact.purge.acknowledged'))
    const ack = publisher.published.find((p) => p.routingKey === 'contact.purge.acknowledged')
    expect(ack?.payload).toEqual({ tenant, contactId, service: 'herald' })
  })

  it('contact-lifecycle consumer: a herald.contact.migrated message carries forward opt-out categories over the real broker', async () => {
    const tenant = uniqueSlug('acme')
    const oldContactId = uniqueSlug('old-contact')
    const newContactId = uniqueSlug('new-contact')

    await consequent.handle(oldContactId, 'optOut.addCategory', { tenant, contactId: oldContactId, category: 'newsletter' })

    await publish('herald.contact.migrated', { tenant, oldContactId, newContactId })

    await waitUntil(async () => {
      const instance = await consequent.fetch('optOut', newContactId)
      const state = instance?.state as unknown as OptOutState | undefined
      return Boolean(state?.optedOutCategories.includes('newsletter'))
    })
  })
})
