import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import {
  startContactLifecycleConsumer,
  CONTACT_PURGED_ROUTING_KEY,
  CONTACT_MIGRATED_ROUTING_KEY,
  type ChannelLike,
  type ConsumedMessage,
} from '../../src/lib/contact-lifecycle-consumer.js'
import type { Publisher } from '../../src/lib/publisher.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { CommunicationState } from '../../src/actors/communication_actor.js'
import type { OptOutState } from '../../src/actors/opt_out_actor.js'
import type { SuppressionState } from '../../src/actors/suppression_actor.js'

// End-to-end tier, same shape as `comms-ingestion-and-delivery.spec.ts`:
// the full RabbitMQ-shaped path for herald's new subscriber side of the
// erasure/lifecycle cascade (ADR 0024/0026/0076), behind a fake
// `ChannelLike` (real broker wiring is exercised separately, see
// `spec/integration/rabbitmq.integration.spec.ts`) -- proving
// `contact.purged` and `herald.contact.migrated` messages actually reach
// the `purgePayload`/opt-out/suppression commands they're supposed to.

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

  async deliver(routingKey: string, payload: unknown): Promise<void> {
    await this.deliverRaw(routingKey, Buffer.from(JSON.stringify(payload)))
  }

  async deliverRaw(routingKey: string, content: Buffer): Promise<void> {
    if (!this.handler) throw new Error('no consumer registered')
    this.handler({ content, fields: { routingKey } })
    // Same tick-yield as `comms-ingestion-and-delivery.spec.ts` -- ack/nack
    // happen inside an unawaited `.then()` chain, mirroring a real amqplib
    // callback.
    await new Promise((resolve) => setImmediate(resolve))
  }
}

class RecordingPublisher implements Publisher {
  public published: Array<{ routingKey: string, payload: unknown }> = []
  async publish(routingKey: string, payload: unknown): Promise<void> {
    this.published.push({ routingKey, payload })
  }
}

describe('contact lifecycle consumer -- contact.purged / herald.contact.migrated, end to end', () => {
  let consequent: ConsequentApi
  let publisher: RecordingPublisher
  let channel: FakeChannel

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = new RecordingPublisher()
    channel = new FakeChannel()
    await startContactLifecycleConsumer(channel, 'contact-lifecycle.queue', { consequent, publisher })
  })

  afterEach(async () => {
    // no fastify app in this suite -- nothing to close
  })

  it('contact.purged strips encryptedPayload from every communication for that contact, deletes the opt-out record, and acks', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')
    const key = `${tenant}:${idempotencyKey}`

    await consequent.handle(key, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional',
      type: 'invite-sent', title: 'Invite', templateVersion: 1,
      encryptedPayload: 'ciphertext-blob', payloadKeyVersion: 1, channel: 'email',
    })
    await consequent.handle(contactId, 'optOut.addCategory', { tenant, contactId, category: 'newsletter' })

    await channel.deliver(CONTACT_PURGED_ROUTING_KEY, { tenant, contactId, accountId: 'acc-1' })

    expect(channel.acked).toHaveLength(1)
    expect(channel.nacked).toHaveLength(0)

    const commState = (await consequent.fetch('communication', key))?.state as unknown as CommunicationState
    expect(commState.encryptedPayload).toBe('')
    expect(commState.payloadPurgedAt).not.toBeNull()
    // Minimal audit fields survive (ADR 0026) -- purge is not a full delete.
    expect(commState.status).toBe('pending')
    expect(commState.contactId).toBe(contactId)

    const optOutState = (await consequent.fetch('optOut', contactId))?.state as unknown as OptOutState
    expect(optOutState.optedOutCategories).toEqual([])

    expect(publisher.published).toHaveLength(1)
    expect(publisher.published[0]).toEqual({
      routingKey: 'contact.purge.acknowledged',
      payload: { tenant, contactId, service: 'herald' },
    })
  })

  it('contact.purged with no communications or opt-out record on file is a safe no-op that still acks and acknowledges', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')

    await channel.deliver(CONTACT_PURGED_ROUTING_KEY, { tenant, contactId, accountId: null })

    expect(channel.acked).toHaveLength(1)
    expect(channel.nacked).toHaveLength(0)
    expect(publisher.published).toHaveLength(1)
  })

  it('a redelivered contact.purged for an already-purged contact is idempotent -- still acks, does not re-reject or error', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')
    const key = `${tenant}:${idempotencyKey}`

    await consequent.handle(key, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional',
      type: 'invite-sent', title: 'Invite', templateVersion: 1,
      encryptedPayload: 'ciphertext-blob', payloadKeyVersion: 1, channel: 'email',
    })

    await channel.deliver(CONTACT_PURGED_ROUTING_KEY, { tenant, contactId })
    await channel.deliver(CONTACT_PURGED_ROUTING_KEY, { tenant, contactId }) // redelivery

    expect(channel.acked).toHaveLength(2)
    expect(channel.nacked).toHaveLength(0)
    expect(publisher.published).toHaveLength(2) // acknowledged both times -- fine, tower's ack consumer is itself idempotent (Set-based)
  })

  it('herald.contact.migrated carries forward opt-out categories and suppression from the old contactId to the new one', async () => {
    const tenant = uniqueSlug('acme')
    const oldContactId = uniqueSlug('old-contact')
    const newContactId = uniqueSlug('new-contact')

    await consequent.handle(oldContactId, 'optOut.addCategory', { tenant, contactId: oldContactId, category: 'newsletter' })
    await consequent.handle(oldContactId, 'suppression.create', { tenant, contactId: oldContactId, reason: 'hard-bounce' })

    await channel.deliver(CONTACT_MIGRATED_ROUTING_KEY, { tenant, oldContactId, newContactId })

    expect(channel.acked).toHaveLength(1)
    expect(channel.nacked).toHaveLength(0)

    const newOptOut = (await consequent.fetch('optOut', newContactId))?.state as unknown as OptOutState
    expect(newOptOut.optedOutCategories).toEqual(['newsletter'])

    const newSuppression = (await consequent.fetch('suppression', newContactId))?.state as unknown as SuppressionState
    expect(newSuppression.reason).toBe('hard-bounce')
    expect(newSuppression.createdAt).toBeTruthy()

    // No `contact.purge.acknowledged` for a migration -- that ack is
    // purge-specific (ADR 0026), migration has no such handshake.
    expect(publisher.published).toHaveLength(0)
  })

  it('herald.contact.migrated with nothing on file at the old contactId is a safe no-op', async () => {
    const tenant = uniqueSlug('acme')
    const oldContactId = uniqueSlug('old-contact')
    const newContactId = uniqueSlug('new-contact')

    await channel.deliver(CONTACT_MIGRATED_ROUTING_KEY, { tenant, oldContactId, newContactId })

    expect(channel.acked).toHaveLength(1)
    expect(channel.nacked).toHaveLength(0)

    const newOptOut = (await consequent.fetch('optOut', newContactId))?.state as unknown as OptOutState
    expect(newOptOut.optedOutCategories).toEqual([])
  })

  it('a redelivered herald.contact.migrated is idempotent -- the suppression.create rejection on the second pass is not an error', async () => {
    const tenant = uniqueSlug('acme')
    const oldContactId = uniqueSlug('old-contact')
    const newContactId = uniqueSlug('new-contact')

    await consequent.handle(oldContactId, 'suppression.create', { tenant, contactId: oldContactId, reason: 'complaint' })

    await channel.deliver(CONTACT_MIGRATED_ROUTING_KEY, { tenant, oldContactId, newContactId })
    await channel.deliver(CONTACT_MIGRATED_ROUTING_KEY, { tenant, oldContactId, newContactId }) // redelivery

    expect(channel.acked).toHaveLength(2)
    expect(channel.nacked).toHaveLength(0)
  })

  it('a malformed message is nacked without requeue (dead-lettered, not retried forever)', async () => {
    await channel.deliverRaw(CONTACT_PURGED_ROUTING_KEY, Buffer.from('{not valid json'))

    expect(channel.nacked).toHaveLength(1)
    expect(channel.nacked[0].requeue).toBe(false)
    expect(channel.acked).toHaveLength(0)
  })

  it('a contact.purged message missing required fields is dead-lettered, not silently processed', async () => {
    await channel.deliver(CONTACT_PURGED_ROUTING_KEY, { tenant: 'acme' }) // missing contactId

    expect(channel.nacked).toHaveLength(1)
    expect(channel.nacked[0].requeue).toBe(false)
    expect(channel.acked).toHaveLength(0)
  })

  it('an unrecognized routing key is dead-lettered rather than silently acked or processed as something else', async () => {
    await channel.deliver('some.other.routing.key', { tenant: 'acme', contactId: 'x' })

    expect(channel.nacked).toHaveLength(1)
    expect(channel.nacked[0].requeue).toBe(false)
    expect(channel.acked).toHaveLength(0)
  })
})
