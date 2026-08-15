import { describe, expect, it, vi } from 'vitest'
import { startCommsConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/comms-consumer.js'
import type { SendWorkerDeps } from '../../src/lib/send-worker.js'

// Proves the real incident this file's own header comment describes can no
// longer happen: a permanent `ingestCommunication` failure (in the real
// incident, a Postgres id-column-width violation, now separately fixed --
// see communication-id.ts) used to requeue via `nack(msg, false, true)`
// unconditionally, forever, with the error itself silently swallowed --
// confirmed live at 1,000+ redeliveries/second before this fix. This test
// drives the channel-agnostic consume logic directly against a fake
// `ChannelLike`/`ConsumedMessage` (no real broker needed -- see this
// file's own header comment for why that's the intended testing seam),
// asserting the bounded, logged behavior replaces it.

function fakeMessage(redelivered: boolean, body: unknown): ConsumedMessage {
  return { content: Buffer.from(JSON.stringify(body)), fields: { redelivered } }
}

function fakeChannel() {
  const acked: ConsumedMessage[] = []
  const nacked: Array<{ msg: ConsumedMessage, requeue: boolean }> = []
  let onMessage: (msg: ConsumedMessage | null) => void = () => {}
  const channel: ChannelLike = {
    async consume(_queue, handler) {
      onMessage = handler
      return {}
    },
    ack(msg) {
      acked.push(msg)
    },
    nack(msg, _allUpTo, requeue) {
      nacked.push({ msg, requeue })
    },
  }
  return { channel, acked, nacked, deliver: (msg: ConsumedMessage) => onMessage(msg) }
}

const validPayload = {
  idempotencyKey: 'invite:abc:sent',
  tenant: 'acme',
  application: 'web',
  contactId: 'contact-1',
  category: 'transactional',
  type: 'invite-sent',
  title: 'Invite',
  templateVersion: 1,
  encryptedPayload: 'ciphertext',
  payloadKeyVersion: 1,
  channel: 'email',
}

describe('startCommsConsumer -- bounded retry, no infinite requeue', () => {
  it('requeues a fresh message once on a caught error', async () => {
    const { channel, nacked, deliver } = fakeChannel()
    const deps = { consequent: { fetch: () => Promise.reject(new Error('boom')) } } as unknown as SendWorkerDeps
    const log = vi.fn()
    await startCommsConsumer(channel, 'herald.comms', deps, log)

    const msg = fakeMessage(false, validPayload)
    deliver(msg)
    await new Promise((resolve) => setImmediate(resolve))

    expect(nacked).toEqual([{ msg, requeue: true }])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('requeuing for one redelivery attempt'))
  })

  it('dead-letters instead of requeuing again once a message comes back marked redelivered', async () => {
    const { channel, nacked, deliver } = fakeChannel()
    const deps = { consequent: { fetch: () => Promise.reject(new Error('boom')) } } as unknown as SendWorkerDeps
    const log = vi.fn()
    await startCommsConsumer(channel, 'herald.comms', deps, log)

    const msg = fakeMessage(true, validPayload) // simulates RabbitMQ's own redelivery
    deliver(msg)
    await new Promise((resolve) => setImmediate(resolve))

    expect(nacked).toEqual([{ msg, requeue: false }])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('dead-lettering instead of requeuing again'))
  })

  it('never loses the error to a silent catch -- always logs it, unlike the pre-fix bare .catch(() => {})', async () => {
    const { channel, deliver } = fakeChannel()
    const deps = { consequent: { fetch: () => Promise.reject(new Error('a specific, real failure message')) } } as unknown as SendWorkerDeps
    const log = vi.fn()
    await startCommsConsumer(channel, 'herald.comms', deps, log)

    deliver(fakeMessage(false, validPayload))
    await new Promise((resolve) => setImmediate(resolve))

    expect(log).toHaveBeenCalledWith(expect.stringContaining('a specific, real failure message'))
  })

  it('dead-letters a malformed message body immediately, redelivered or not', async () => {
    const { channel, nacked, deliver } = fakeChannel()
    const deps = {} as SendWorkerDeps
    const log = vi.fn()
    await startCommsConsumer(channel, 'herald.comms', deps, log)

    const msg: ConsumedMessage = { content: Buffer.from('not json'), fields: { redelivered: false } }
    deliver(msg)

    expect(nacked).toEqual([{ msg, requeue: false }])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('malformed message body'))
  })

  it('acks normally when ingestCommunication succeeds', async () => {
    const { channel, acked, nacked, deliver } = fakeChannel()
    const deps = {
      consequent: {
        fetch: () => Promise.resolve({ state: { createdAt: '2026-01-01T00:00:00Z', status: 'suppressed' } }),
      },
    } as unknown as SendWorkerDeps
    await startCommsConsumer(channel, 'herald.comms', deps)

    const msg = fakeMessage(false, validPayload)
    deliver(msg)
    await new Promise((resolve) => setImmediate(resolve))

    expect(acked).toEqual([msg])
    expect(nacked).toEqual([])
  })
})
