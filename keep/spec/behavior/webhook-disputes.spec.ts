import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: ADR 0107's dispute rule. Stripe copies no metadata onto a
// Dispute, so keep retrieves the disputed charge, takes its `customer`, and
// uses keep's customer record for that Stripe customer as the dispute's
// scope. The dispute degrades that scope's subscription through the same
// degrade the grace period uses, records which subscription it degraded,
// and a won dispute restores that one; a lost dispute changes only the
// dispute's status.

function stripeEventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
}

const PLAN_ROLES = [{ application: 'demo-app', role: 'member' }, { application: 'demo-app', role: 'billing-admin' }]

describe('stripe webhook handling -- disputes resolve scope through the charge (ADR 0107)', () => {
  let t: TestApp
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    readHeaders = await t.headers({ permissions: ['billing:read'] })
    const manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', roles: PLAN_ROLES },
    })
  })

  afterEach(async () => {
    await t.app.close()
  })

  async function post(type: string, object: Record<string, unknown>) {
    return t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload(type, object),
    })
  }

  // An active subscription for `acct_<id>`, paid by Stripe customer `cus_<id>`;
  // what its activation published is forgotten.
  async function activate(id: string) {
    const response = await post('customer.subscription.created', {
      id: `sub_${id}`,
      customer: `cus_${id}`,
      status: 'active',
      items: { data: [{ price: { id: 'price_basic' }, current_period_end: 1_700_000_000 }] },
      metadata: { scope: JSON.stringify({ account: `acct_${id}` }) },
    })
    expect(response.statusCode).toBe(200)
    t.publisher.published.length = 0
  }

  // A dispute object as Stripe sends it: no metadata at all.
  function disputeObject(id: string, chargeId: string, status: string) {
    return { id, charge: chargeId, amount: 1000, currency: 'usd', reason: 'fraudulent', status }
  }

  async function disputeCreated(id: string, chargeId: string) {
    const response = await post('charge.dispute.created', disputeObject(id, chargeId, 'needs_response'))
    expect(response.statusCode).toBe(200)
  }

  async function disputeClosed(id: string, chargeId: string, status: 'won' | 'lost') {
    const response = await post('charge.dispute.closed', disputeObject(id, chargeId, status))
    expect(response.statusCode).toBe(200)
  }

  async function dispute(id: string) {
    const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
    return (response.json() as Array<{ stripeDisputeId: string, scope: unknown, status: string, degradedSubscriptionId: string | null }>)
      .find((d) => d.stripeDisputeId === id)
  }

  async function subscription(id: string) {
    const response = await t.app.inject({ method: 'GET', url: `/tenants/acme/subscriptions/${id}`, headers: readHeaders })
    return response.json() as { status: string, entitlement: string }
  }

  function published(type: string) {
    return t.publisher.published.filter((e) => e.type === type)
  }

  it('a dispute with no metadata degrades the subscription of the charge\'s customer', async () => {
    await activate('a')
    t.stripeState.charges.set('ch_a', { id: 'ch_a', customer: 'cus_a' })

    await disputeCreated('dp_a', 'ch_a')

    expect(published('entitlement.role-revoked')).toHaveLength(PLAN_ROLES.length)
    for (const event of published('entitlement.role-revoked')) {
      expect((event as { scope: unknown }).scope).toEqual({ account: 'acct_a' })
    }
    expect((await subscription('sub_a')).entitlement).toBe('degraded')
    const record = await dispute('dp_a')
    expect(record?.scope).toEqual({ account: 'acct_a' })
    expect(record?.degradedSubscriptionId).toBe('sub_a')
  })

  it('a won dispute restores the subscription it degraded', async () => {
    await activate('b')
    t.stripeState.charges.set('ch_b', { id: 'ch_b', customer: 'cus_b' })
    await disputeCreated('dp_b', 'ch_b')
    t.publisher.published.length = 0

    await disputeClosed('dp_b', 'ch_b', 'won')

    expect(published('entitlement.role-granted')).toHaveLength(PLAN_ROLES.length)
    expect(published('entitlement.role-revoked')).toHaveLength(0)
    expect((await subscription('sub_b')).entitlement).toBe('granted')
    expect((await dispute('dp_b'))?.status).toBe('won')
  })

  it('a lost dispute publishes nothing and leaves the subscription degraded', async () => {
    await activate('c')
    t.stripeState.charges.set('ch_c', { id: 'ch_c', customer: 'cus_c' })
    await disputeCreated('dp_c', 'ch_c')
    t.publisher.published.length = 0

    await disputeClosed('dp_c', 'ch_c', 'lost')

    expect(t.publisher.published).toHaveLength(0)
    expect((await subscription('sub_c')).entitlement).toBe('degraded')
    expect((await dispute('dp_c'))?.status).toBe('lost')
  })

  it('a dispute on a customer keep has no record of is recorded and publishes nothing', async () => {
    await activate('d')
    t.stripeState.charges.set('ch_unknown', { id: 'ch_unknown', customer: 'cus_unknown' })

    await disputeCreated('dp_unknown', 'ch_unknown')
    await disputeClosed('dp_unknown', 'ch_unknown', 'won')

    expect(t.publisher.published).toHaveLength(0)
    const record = await dispute('dp_unknown')
    expect(record?.scope).toBeNull()
    expect(record?.degradedSubscriptionId).toBeNull()
    expect(record?.status).toBe('won')
    expect((await subscription('sub_d')).entitlement).toBe('granted')
  })

  it('a dispute on a charge with no customer is recorded and publishes nothing', async () => {
    t.stripeState.charges.set('ch_guest', { id: 'ch_guest', customer: null })

    await disputeCreated('dp_guest', 'ch_guest')

    expect(t.publisher.published).toHaveLength(0)
    expect((await dispute('dp_guest'))?.scope).toBeNull()
  })

  it('a dispute on a subscription already degraded publishes nothing, and its win restores nothing', async () => {
    await activate('e')
    // Three failed attempts reach the default threshold and degrade it first.
    await post('invoice.payment_failed', { subscription: 'sub_e', customer: 'cus_e', attempt_count: 3, next_payment_attempt: null })
    expect((await subscription('sub_e')).entitlement).toBe('degraded')
    t.publisher.published.length = 0
    t.stripeState.charges.set('ch_e', { id: 'ch_e', customer: 'cus_e' })

    await disputeCreated('dp_e', 'ch_e')
    expect(t.publisher.published).toHaveLength(0)
    expect((await dispute('dp_e'))?.degradedSubscriptionId).toBeNull()

    await disputeClosed('dp_e', 'ch_e', 'won')
    expect(t.publisher.published).toHaveLength(0)
    expect((await subscription('sub_e')).entitlement).toBe('degraded')
  })

  it('a second dispute on the same subscription publishes nothing, and only the first one\'s win restores', async () => {
    await activate('f')
    t.stripeState.charges.set('ch_f1', { id: 'ch_f1', customer: 'cus_f' })
    t.stripeState.charges.set('ch_f2', { id: 'ch_f2', customer: 'cus_f' })
    await disputeCreated('dp_f1', 'ch_f1')
    t.publisher.published.length = 0

    await disputeCreated('dp_f2', 'ch_f2')
    expect(t.publisher.published).toHaveLength(0)

    await disputeClosed('dp_f2', 'ch_f2', 'won')
    expect(t.publisher.published).toHaveLength(0)

    await disputeClosed('dp_f1', 'ch_f1', 'won')
    expect(published('entitlement.role-granted')).toHaveLength(PLAN_ROLES.length)
  })

  it('a redelivered dispute.created publishes nothing a second time and keeps what it degraded', async () => {
    await activate('g')
    t.stripeState.charges.set('ch_g', { id: 'ch_g', customer: 'cus_g' })
    await disputeCreated('dp_g', 'ch_g')
    t.publisher.published.length = 0

    await disputeCreated('dp_g', 'ch_g')

    expect(t.publisher.published).toHaveLength(0)
    expect((await dispute('dp_g'))?.degradedSubscriptionId).toBe('sub_g')
  })

  it('a charge Stripe cannot find fails the webhook, so Stripe redelivers it', async () => {
    const response = await post('charge.dispute.created', disputeObject('dp_missing', 'ch_missing', 'needs_response'))

    expect(response.statusCode).toBe(500)
    expect(await dispute('dp_missing')).toBeUndefined()
  })
})
