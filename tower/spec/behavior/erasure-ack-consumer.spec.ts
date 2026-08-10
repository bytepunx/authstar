import { beforeEach, describe, expect, it } from 'vitest'
import { startErasureAckConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/erasure-ack-consumer.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for the `contact.purge.acknowledged` consumer (ADR 0026) --
// same fake-`ChannelLike` convention as `entitlement-consumer.spec.ts`.

function fakeChannel() {
  let onMessage: ((msg: ConsumedMessage | null) => void) | undefined
  const acked: ConsumedMessage[] = []
  const nacked: Array<{ msg: ConsumedMessage, allUpTo: boolean, requeue: boolean }> = []
  const channel: ChannelLike = {
    async consume(_queue, cb) {
      onMessage = cb
      return {}
    },
    ack(msg) {
      acked.push(msg)
    },
    nack(msg, allUpTo, requeue) {
      nacked.push({ msg, allUpTo, requeue })
    },
  }
  function deliver(payload: unknown) {
    onMessage!({ content: Buffer.from(JSON.stringify(payload), 'utf8'), fields: { routingKey: 'contact.purge.acknowledged' } })
  }
  return { channel, deliver, acked, nacked }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('contact.purge.acknowledged consumer', () => {
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    await consequent.handle('contact-1', 'erasureRequest.create', { tenant: 'acme', contactId: 'contact-1', accountId: 'acct-1' })
  })

  it('appends the acknowledging service to the erasureRequest', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startErasureAckConsumer(channel, 'q', { consequent })

    deliver({ tenant: 'acme', contactId: 'contact-1', service: 'herald' })
    await flush()

    expect(acked).toHaveLength(1)
    const req = await consequent.fetch('erasureRequest', 'contact-1')
    expect(req!.state.acknowledgedBy).toEqual(['herald'])
    expect(req!.state.status).toBe('pending')
  })

  it('flips to completed once all expected services acknowledge', async () => {
    const { channel, deliver } = fakeChannel()
    await startErasureAckConsumer(channel, 'q', { consequent })

    deliver({ tenant: 'acme', contactId: 'contact-1', service: 'herald' })
    await flush()
    deliver({ tenant: 'acme', contactId: 'contact-1', service: 'keep' })
    await flush()

    const req = await consequent.fetch('erasureRequest', 'contact-1')
    expect(req!.state.status).toBe('completed')
  })

  it('dead-letters a message missing required fields', async () => {
    const { channel, deliver, nacked } = fakeChannel()
    await startErasureAckConsumer(channel, 'q', { consequent })

    deliver({ tenant: 'acme' })
    await flush()

    expect(nacked).toEqual([{ msg: expect.anything(), allUpTo: false, requeue: false }])
  })
})
