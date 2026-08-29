import { beforeEach, describe, expect, it } from 'vitest'
import { startEntitlementConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/entitlement-consumer.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for the `entitlement.*` RabbitMQ consumer (ADR 0038/0031).
// Same fake-`ChannelLike` convention as herald's `comms-consumer.ts`
// tests -- no real broker, a hand-written fake channel whose stored
// `onMessage` callback is invoked directly with synthetic messages, and
// assertions on which of `ack`/`nack` (and with what args) got called.

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

// A short async tick so the consumer's own promise chain (handle -> ack/nack)
// settles before assertions run -- `channel.consume`'s callback is
// synchronous but `handleEntitlementEvent` is async.
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('entitlement.* RabbitMQ consumer', () => {
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })
    await consequent.handle('acme', 'tenant.create', { slug: 'acme', name: 'Acme', cookieDomain: 'acme.test', createdBy: 'test' })
    await consequent.handle('org-1', 'organization.create', { organizationId: 'org-1', tenant: 'acme', name: 'Acme Corp' })
  })

  it('grants a role on entitlement.role-granted', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.role-granted', {
      tenant: 'acme', scope: { account: 'acct-1' }, sequence: 1,
      role: { name: 'pro', scope: 'tenant' },
    })
    await flush()

    expect(acked).toHaveLength(1)
    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.grantedRoles).toEqual([{ name: 'pro', scope: 'tenant' }])
  })

  it('is idempotent under redelivery of the same role-granted event', async () => {
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    const event = { tenant: 'acme', scope: { account: 'acct-1' }, sequence: 1, role: { name: 'pro', scope: 'tenant' } }
    deliver('entitlement.role-granted', event)
    await flush()
    deliver('entitlement.role-granted', event)
    await flush()

    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.grantedRoles).toEqual([{ name: 'pro', scope: 'tenant' }])
  })

  it('revokes a role on entitlement.role-revoked, tolerant of arriving before any matching grant', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.role-revoked', {
      tenant: 'acme', scope: { account: 'acct-1' }, sequence: 1,
      role: { name: 'pro', scope: 'tenant' },
    })
    await flush()

    expect(acked).toHaveLength(1)
    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.grantedRoles).toEqual([])
  })

  it('grants a trial role with expiry on entitlement.trial-granted', async () => {
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.trial-granted', {
      tenant: 'acme', scope: { account: 'acct-1' }, sequence: 1,
      role: { name: 'trial-pro', scope: 'tenant' }, trialExpiresAt: '2030-01-01T00:00:00.000Z',
    })
    await flush()

    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.trialRoles).toEqual([{ name: 'trial-pro', scope: 'tenant' }])
    expect(account!.state.trialExpiresAt).toBe('2030-01-01T00:00:00.000Z')
  })

  it('updates tenant seatLimit on entitlement.seat-limit-changed', async () => {
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.seat-limit-changed', { tenant: 'acme', scope: { tenant: 'acme' }, sequence: 1, seatLimit: 50 })
    await flush()

    const tenant = await consequent.fetch('tenant', 'acme')
    expect(tenant!.state.seatLimit).toBe(50)
  })

  it('grants a role on an organization (ADR 0100) -- never merged onto any account.roles', async () => {
    const { channel, deliver, acked } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.role-granted', {
      tenant: 'acme', scope: { organization: 'org-1' }, sequence: 1,
      role: { name: 'member', scope: 'demo-app' },
    })
    await flush()

    expect(acked).toHaveLength(1)
    const org = await consequent.fetch('organization', 'org-1')
    expect(org!.state.grantedRoles).toEqual([{ application: 'demo-app', role: 'member' }])
    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.grantedRoles).toEqual([])
  })

  it('revokes a role from an organization on entitlement.role-revoked', async () => {
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.role-granted', { tenant: 'acme', scope: { organization: 'org-1' }, sequence: 1, role: { name: 'member', scope: 'demo-app' } })
    await flush()
    deliver('entitlement.role-revoked', { tenant: 'acme', scope: { organization: 'org-1' }, sequence: 2, role: { name: 'member', scope: 'demo-app' } })
    await flush()

    const org = await consequent.fetch('organization', 'org-1')
    expect(org!.state.grantedRoles).toEqual([])
  })

  it('updates organization seatLimit on entitlement.seat-limit-changed, not the tenant\'s', async () => {
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.seat-limit-changed', { tenant: 'acme', scope: { organization: 'org-1' }, sequence: 1, seatLimit: 10 })
    await flush()

    const org = await consequent.fetch('organization', 'org-1')
    expect(org!.state.seatLimit).toBe(10)
    const tenant = await consequent.fetch('tenant', 'acme')
    expect(tenant!.state.seatLimit).toBeNull()
  })

  it('dead-letters a malformed message without requeueing', async () => {
    const { channel, deliverRaw, acked, nacked } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliverRaw('entitlement.role-granted', '{not valid json')
    await flush()

    expect(acked).toHaveLength(0)
    expect(nacked).toEqual([{ msg: expect.anything(), allUpTo: false, requeue: false }])
  })

  it('ignores an unrecognized entitlement event type without error (open vocabulary)', async () => {
    const { channel, deliver, acked, nacked } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })

    deliver('entitlement.some-future-event', { tenant: 'acme', scope: { account: 'acct-1' } })
    await flush()

    expect(acked).toHaveLength(1)
    expect(nacked).toHaveLength(0)
  })
})
