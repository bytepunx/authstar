import { beforeEach, describe, expect, it } from 'vitest'
import { startRoleReferenceConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/role-reference-consumer.js'
import { createRoleReferenceCache, type RoleReferenceCache } from '../../src/lib/role-reference-cache.js'

// Behavior tier for the `application.*`/`roleDefinition.*` RabbitMQ
// consumer (ADR 0047). Same fake-`ChannelLike` convention as tower's own
// `entitlement-consumer.spec.ts` -- no real broker, a hand-written fake
// channel whose stored `onMessage` callback is invoked directly with
// synthetic messages, and assertions on which of `ack`/`nack` (and with
// what args) got called.

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

describe('application.*/roleDefinition.* RabbitMQ consumer', () => {
  let cache: RoleReferenceCache

  beforeEach(() => {
    cache = createRoleReferenceCache()
  })

  it('marks an application known+active on application.created', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    await flush()

    expect(acked).toHaveLength(1)
    // A role against 'billing' still fails validation -- no role-definition
    // event has arrived yet -- but this proves the application half landed.
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('marks an application inactive on application.suspended, invalidating any role under it', async () => {
    const { channel, deliver } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    deliver('roleDefinition.created', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'active' })
    await flush()
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)

    deliver('application.suspended', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'suspended' })
    await flush()

    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('marks an application inactive on application.deleted', async () => {
    const { channel, deliver } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    deliver('roleDefinition.created', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'active' })
    deliver('application.deleted', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'deleted' })
    await flush()

    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('validates a granted role once both application.created and roleDefinition.created have arrived', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    deliver('roleDefinition.created', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'active' })
    await flush()

    expect(acked).toHaveLength(2)
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
  })

  it('invalidates a role on roleDefinition.retired without touching the application', async () => {
    const { channel, deliver } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    deliver('roleDefinition.created', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'active' })
    await flush()

    deliver('roleDefinition.retired', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'retired' })
    await flush()

    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
    expect(cache.isValid('acme', { application: 'billing', role: 'admin' })).toBe(false) // never existed either
  })

  it('ignores a tenant-wide roleDefinition event -- keep never tracks tower admin-role definitions', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('roleDefinition.created', { tenant: 'acme', name: 'admin', scope: 'tenant', status: 'active' })
    await flush()

    expect(acked).toHaveLength(1) // still acked -- a deliberate no-op, not an error
    expect(cache.isValid('acme', { application: 'tenant', role: 'admin' })).toBe(false)
  })

  it('does not leak a role/application across tenants', async () => {
    const { channel, deliver } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('application.created', { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' })
    deliver('roleDefinition.created', { tenant: 'acme', name: 'member', scope: { application: 'billing' }, status: 'active' })
    await flush()

    expect(cache.isValid('other-tenant', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('dead-letters a malformed message without requeueing', async () => {
    const { channel, deliverRaw, acked, nacked } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliverRaw('application.created', '{not valid json')
    await flush()

    expect(acked).toHaveLength(0)
    expect(nacked).toEqual([{ msg: expect.anything(), allUpTo: false, requeue: false }])
  })

  it('ignores a message on an unrecognized routing key without error', async () => {
    const { channel, deliver, acked, nacked } = fakeChannel()
    await startRoleReferenceConsumer(channel, 'q', cache)

    deliver('some.other.event', { tenant: 'acme' })
    await flush()

    expect(acked).toHaveLength(1)
    expect(nacked).toHaveLength(0)
  })
})
