import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: ADR 0107's grace period and degraded state. Keep degrades a
// subscription's plan roles only when a failed invoice's `attempt_count`
// reaches the tenant's `paymentFailureAttempts` (default 3), or sooner when
// Stripe marks the subscription `unpaid` or `canceled`; `invoice.paid`
// restores them. Degrade and restore publish one event per plan role, and
// each is a no-op when the subscription is already in that state.

function stripeEventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
}

const PLAN_ROLES = [{ application: 'demo-app', role: 'member' }, { application: 'demo-app', role: 'billing-admin' }]

describe('stripe webhook handling -- payment failure grace period (ADR 0107)', () => {
  let t: TestApp
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    readHeaders = await t.headers({ permissions: ['billing:read'] })
    const manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    t.stripeState.prices.set('price_pro', { unitAmount: 5000, currency: 'usd', interval: 'month' })
    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', roles: PLAN_ROLES },
    })
    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_pro', name: 'Pro', roles: [...PLAN_ROLES, { application: 'demo-app', role: 'admin' }] },
    })
  })

  afterEach(async () => {
    await t.app.close()
  })

  async function post(type: string, object: Record<string, unknown>) {
    const response = await t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload(type, object),
    })
    expect(response.statusCode).toBe(200)
    return response
  }

  function subscriptionObject(id: string, status: string, price = 'price_basic') {
    return {
      id,
      customer: `cus_${id}`,
      status,
      items: { data: [{ price: { id: price }, current_period_end: 1_700_000_000 }] },
      metadata: { scope: JSON.stringify({ account: `acct_${id}` }) },
    }
  }

  // Creates an active subscription and forgets what its activation published.
  async function activate(id: string) {
    await post('customer.subscription.created', subscriptionObject(id, 'active'))
    t.publisher.published.length = 0
  }

  async function paymentFailed(id: string, attemptCount: number, nextPaymentAttempt: number | null = 1_700_100_000) {
    return post('invoice.payment_failed', { subscription: id, customer: `cus_${id}`, attempt_count: attemptCount, next_payment_attempt: nextPaymentAttempt })
  }

  async function invoicePaid(id: string) {
    return post('invoice.paid', { subscription: id, customer: `cus_${id}` })
  }

  async function record(id: string) {
    const response = await t.app.inject({ method: 'GET', url: `/tenants/acme/subscriptions/${id}`, headers: readHeaders })
    return response.json() as { status: string, entitlement: string, lastFailedAttempt: number | null, nextPaymentAttempt: string | null }
  }

  function published(type: string) {
    return t.publisher.published.filter((e) => e.type === type)
  }

  function roleNames(type: string) {
    return published(type).map((e) => (e as { role: { name: string } }).role.name).sort()
  }

  describe('with the default threshold of 3', () => {
    it('attempts 1 and 2 publish nothing; attempt 3 revokes each plan role and sets degraded', async () => {
      await activate('sub_grace')

      await paymentFailed('sub_grace', 1)
      await paymentFailed('sub_grace', 2)
      expect(t.publisher.published).toHaveLength(0)
      const during = await record('sub_grace')
      expect(during.entitlement).toBe('granted')
      expect(during.lastFailedAttempt).toBe(2)
      expect(during.nextPaymentAttempt).toBe(new Date(1_700_100_000 * 1000).toISOString())
      expect(during.status).toBe('active') // payment_failed never changes the status

      await paymentFailed('sub_grace', 3, null)
      expect(t.publisher.published).toHaveLength(2)
      expect(roleNames('entitlement.role-revoked')).toEqual(['billing-admin', 'member'])
      const after = await record('sub_grace')
      expect(after.entitlement).toBe('degraded')
      expect(after.lastFailedAttempt).toBe(3)
      expect(after.nextPaymentAttempt).toBeNull()
    })

    it('a later invoice.paid grants each plan role, sets granted, and clears the failure', async () => {
      await activate('sub_recover')
      await paymentFailed('sub_recover', 3)
      t.publisher.published.length = 0

      await invoicePaid('sub_recover')

      expect(t.publisher.published).toHaveLength(2)
      expect(roleNames('entitlement.role-granted')).toEqual(['billing-admin', 'member'])
      const after = await record('sub_recover')
      expect(after.entitlement).toBe('granted')
      expect(after.lastFailedAttempt).toBeNull()
      expect(after.nextPaymentAttempt).toBeNull()
    })

    it('a failure past the threshold on a degraded subscription publishes nothing', async () => {
      await activate('sub_past_threshold')
      await paymentFailed('sub_past_threshold', 3)
      t.publisher.published.length = 0

      await paymentFailed('sub_past_threshold', 4)
      expect(t.publisher.published).toHaveLength(0)
    })
  })

  it('with the threshold at 1, the first failure degrades', async () => {
    await t.stripeConfig.setPaymentFailureAttempts('acme', 1)
    await activate('sub_strict')

    await paymentFailed('sub_strict', 1)

    expect(roleNames('entitlement.role-revoked')).toEqual(['billing-admin', 'member'])
    expect((await record('sub_strict')).entitlement).toBe('degraded')
  })

  it('unpaid degrades before the threshold, and a second degrade trigger publishes nothing', async () => {
    await activate('sub_unpaid')
    await paymentFailed('sub_unpaid', 1)
    await post('customer.subscription.updated', subscriptionObject('sub_unpaid', 'unpaid'))

    expect(roleNames('entitlement.role-revoked')).toEqual(['billing-admin', 'member'])
    expect((await record('sub_unpaid')).entitlement).toBe('degraded')
    t.publisher.published.length = 0

    await paymentFailed('sub_unpaid', 3)
    await post('customer.subscription.deleted', subscriptionObject('sub_unpaid', 'canceled'))
    expect(t.publisher.published).toHaveLength(0)
  })

  it('invoice.paid on a granted subscription publishes nothing', async () => {
    await activate('sub_renewal')

    await invoicePaid('sub_renewal')

    expect(t.publisher.published).toHaveLength(0)
    expect((await record('sub_renewal')).entitlement).toBe('granted')
  })

  it('invoice.paid ahead of the update to active reads the status from Stripe and restores', async () => {
    await activate('sub_race')
    await post('customer.subscription.updated', subscriptionObject('sub_race', 'past_due'))
    await paymentFailed('sub_race', 3)
    t.publisher.published.length = 0
    t.stripeState.subscriptions.set('sub_race', {
      id: 'sub_race',
      customer: 'cus_sub_race',
      status: 'active',
      currentPeriodEnd: 1_702_000_000,
      stripePriceId: 'price_basic',
      metadata: {},
    })

    await invoicePaid('sub_race')

    expect(roleNames('entitlement.role-granted')).toEqual(['billing-admin', 'member'])
    const after = await record('sub_race')
    expect(after.status).toBe('active')
    expect(after.entitlement).toBe('granted')
  })

  it('a canceled subscription is revoked once and stays degraded through invoice.paid', async () => {
    await activate('sub_canceled')
    await post('customer.subscription.deleted', subscriptionObject('sub_canceled', 'canceled'))
    expect(published('entitlement.role-revoked')).toHaveLength(2)
    t.publisher.published.length = 0
    t.stripeState.subscriptions.set('sub_canceled', {
      id: 'sub_canceled',
      customer: 'cus_sub_canceled',
      status: 'canceled',
      currentPeriodEnd: 1_700_000_000,
      stripePriceId: 'price_basic',
      metadata: {},
    })

    await invoicePaid('sub_canceled')
    await post('customer.subscription.updated', subscriptionObject('sub_canceled', 'canceled'))

    expect(t.publisher.published).toHaveLength(0)
    expect((await record('sub_canceled')).entitlement).toBe('degraded')
  })

  it('incomplete_expired revokes nothing', async () => {
    await activate('sub_expired')

    await post('customer.subscription.updated', subscriptionObject('sub_expired', 'incomplete_expired'))
    await post('customer.subscription.deleted', subscriptionObject('sub_expired', 'incomplete_expired'))

    expect(t.publisher.published).toHaveLength(0)
    const after = await record('sub_expired')
    expect(after.status).toBe('incomplete_expired')
    expect(after.entitlement).toBe('granted')
  })

  it('a price change on a degraded subscription grants nothing, and the restore grants the new plan in full', async () => {
    await activate('sub_upgrade')
    await paymentFailed('sub_upgrade', 3)
    t.publisher.published.length = 0

    await post('customer.subscription.updated', subscriptionObject('sub_upgrade', 'active', 'price_pro'))
    expect(published('entitlement.role-granted')).toHaveLength(0)
    expect(published('entitlement.role-revoked')).toHaveLength(0)

    await invoicePaid('sub_upgrade')
    expect(roleNames('entitlement.role-granted')).toEqual(['admin', 'billing-admin', 'member'])
  })

  it('pause degrades and resume restores, each once', async () => {
    await activate('sub_pause')

    await post('customer.subscription.updated', subscriptionObject('sub_pause', 'paused'))
    await post('customer.subscription.paused', subscriptionObject('sub_pause', 'paused'))
    expect(published('entitlement.role-revoked')).toHaveLength(2)
    expect((await record('sub_pause')).entitlement).toBe('degraded')

    await post('customer.subscription.resumed', subscriptionObject('sub_pause', 'active'))
    await post('customer.subscription.resumed', subscriptionObject('sub_pause', 'active'))
    expect(published('entitlement.role-granted')).toHaveLength(2)
    expect((await record('sub_pause')).entitlement).toBe('granted')
  })
})
