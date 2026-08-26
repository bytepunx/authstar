import { beforeEach, describe, expect, it } from 'vitest'
import { startOrganizationReferenceConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/organization-reference-consumer.js'
import { createOrganizationManagerCache, type OrganizationManagerCache } from '../../src/lib/organization-manager-cache.js'

// Behavior tier for the `organization.manager-*` RabbitMQ consumer (ADR
// 0098). Same fake-`ChannelLike` convention as role-reference-consumer.spec.ts
// -- no real broker, a hand-written fake channel whose stored `onMessage`
// callback is invoked directly with synthetic messages.

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
  function deliver(routingKey: string, payload: unknown) {
    onMessage!({ content: Buffer.from(JSON.stringify(payload), 'utf8'), fields: { routingKey } })
  }
  function deliverRaw(routingKey: string, rawContent: string) {
    onMessage!({ content: Buffer.from(rawContent, 'utf8'), fields: { routingKey } })
  }
  return { channel, deliver, deliverRaw, acked, nacked }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('organization.manager-* RabbitMQ consumer', () => {
  let cache: OrganizationManagerCache

  beforeEach(() => {
    cache = createOrganizationManagerCache()
  })

  it('adds a manager on organization.manager-added', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliver('organization.manager-added', { organizationId: 'org_1', tenant: 'acme', accountId: 'mgr_1' })
    await flush()

    expect(acked).toHaveLength(1)
    expect(cache.get('org_1')).toEqual(['mgr_1'])
  })

  it('removes a manager on organization.manager-removed', async () => {
    const { channel, deliver } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliver('organization.manager-added', { organizationId: 'org_1', tenant: 'acme', accountId: 'mgr_1' })
    deliver('organization.manager-removed', { organizationId: 'org_1', tenant: 'acme', accountId: 'mgr_1' })
    await flush()

    expect(cache.get('org_1')).toEqual([])
  })

  it('swaps the departing manager for the successor on organization.manager-succeeded', async () => {
    const { channel, deliver } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliver('organization.manager-added', { organizationId: 'org_1', tenant: 'acme', accountId: 'mgr_1' })
    deliver('organization.manager-succeeded', { organizationId: 'org_1', tenant: 'acme', departingAccountId: 'mgr_1', successorAccountId: 'mgr_2' })
    await flush()

    expect(cache.get('org_1')).toEqual(['mgr_2'])
  })

  it('does not leak managers across organizations', async () => {
    const { channel, deliver } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliver('organization.manager-added', { organizationId: 'org_1', tenant: 'acme', accountId: 'mgr_1' })
    await flush()

    expect(cache.get('org_2')).toEqual([])
  })

  it('dead-letters a malformed message without requeueing', async () => {
    const { channel, deliverRaw, acked, nacked } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliverRaw('organization.manager-added', '{not valid json')
    await flush()

    expect(acked).toHaveLength(0)
    expect(nacked).toEqual([{ msg: expect.anything(), allUpTo: false, requeue: false }])
  })

  it('ignores a message on an unrecognized routing key without error', async () => {
    const { channel, deliver, acked, nacked } = fakeChannel()
    await startOrganizationReferenceConsumer(channel, 'q', cache)

    deliver('some.other.event', { tenant: 'acme' })
    await flush()

    expect(acked).toHaveLength(1)
    expect(nacked).toHaveLength(0)
  })
})
