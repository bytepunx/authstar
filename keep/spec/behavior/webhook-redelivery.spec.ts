import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: S-0005's idempotency guard. Keep records each Stripe event
// id it has handled, and a redelivery of a recorded id answers 200 and runs
// no handler. The test counts publishes, not records: a handler that is
// idempotent in its records can still publish a second `role-granted` or
// `role-revoked`, and tower would apply it again. The handlers' own no-op
// in the target state (ADR 0107) stays a second line, for two events with
// different ids that trigger the same change.

const PLAN_ROLES = [{ application: 'demo-app', role: 'member' }, { application: 'demo-app', role: 'billing-admin' }]

let eventCounter = 0
function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${++eventCounter}_${Math.random().toString(36).slice(2)}`) {
  return JSON.stringify({ id, type, data: { object } })
}

function subscriptionObject(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: `sub_${id}`,
    customer: `cus_${id}`,
    status,
    items: { data: [{ price: { id: 'price_basic' }, current_period_end: 1_700_000_000 }] },
    metadata: { scope: JSON.stringify({ account: `acct_${id}` }) },
    ...extra,
  }
}

describe('stripe webhook handling -- each event id is handled once', () => {
  let t: TestApp
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    readHeaders = await t.headers({ permissions: ['billing:read'] })
    const manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    await t.stripeConfig.setPaymentFailureAttempts('acme', 1)
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', roles: PLAN_ROLES },
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await t.app.close()
  })

  async function post(payload: string) {
    return t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload,
    })
  }

  async function activate(id: string) {
    const response = await post(stripeEvent('customer.subscription.created', subscriptionObject(id, 'active')))
    expect(response.statusCode).toBe(200)
  }

  // Delivers one event twice with the same id. Both answer 200; the second
  // runs no handler, so it writes no command and publishes nothing.
  async function deliverTwice(payload: string) {
    const first = await post(payload)
    expect(first.statusCode).toBe(200)
    const publishedAfterFirst = t.publisher.published.length

    const handle = vi.spyOn(t.consequent, 'handle')
    const second = await post(payload)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ received: true, duplicate: true })
    expect(handle).not.toHaveBeenCalled()
    handle.mockRestore()

    expect(t.publisher.published).toHaveLength(publishedAfterFirst)
    return publishedAfterFirst
  }

  // One case per event type the webhook handles; each sets up the state that
  // makes the first delivery do something.
  const cases: Array<{ type: string, setup?: () => Promise<void>, object: () => Record<string, unknown>, publishes: boolean }> = [
    {
      type: 'checkout.session.completed',
      setup: async () => {
        t.stripeState.subscriptions.set('sub_cs', {
          id: 'sub_cs', customer: 'cus_cs', status: 'active', currentPeriodEnd: 1_700_000_000, stripePriceId: 'price_basic',
          metadata: { scope: JSON.stringify({ account: 'acct_cs' }) },
        })
      },
      object: () => ({ id: 'cs_1', customer: 'cus_cs', subscription: 'sub_cs' }),
      publishes: true,
    },
    { type: 'customer.subscription.created', object: () => subscriptionObject('created', 'active'), publishes: true },
    {
      type: 'customer.subscription.updated',
      setup: () => activate('updated'),
      object: () => subscriptionObject('updated', 'unpaid'),
      publishes: true,
    },
    {
      type: 'customer.subscription.deleted',
      setup: () => activate('deleted'),
      object: () => subscriptionObject('deleted', 'canceled'),
      publishes: true,
    },
    {
      type: 'customer.subscription.paused',
      setup: () => activate('paused'),
      object: () => subscriptionObject('paused', 'paused'),
      publishes: true,
    },
    {
      type: 'customer.subscription.resumed',
      setup: async () => {
        await activate('resumed')
        await post(stripeEvent('customer.subscription.paused', subscriptionObject('resumed', 'paused')))
      },
      object: () => subscriptionObject('resumed', 'active'),
      publishes: true,
    },
    {
      type: 'invoice.payment_failed',
      setup: () => activate('failed'),
      object: () => ({ subscription: 'sub_failed', customer: 'cus_failed', attempt_count: 1, next_payment_attempt: null }),
      publishes: true,
    },
    {
      type: 'invoice.paid',
      setup: async () => {
        await activate('paid')
        await post(stripeEvent('invoice.payment_failed', { subscription: 'sub_paid', customer: 'cus_paid', attempt_count: 1, next_payment_attempt: null }))
      },
      object: () => ({ subscription: 'sub_paid', customer: 'cus_paid' }),
      publishes: true,
    },
    {
      type: 'charge.refunded',
      object: () => ({
        id: 'ch_refund', customer: 'cus_refund',
        refunds: { data: [{ id: 're_1', amount: 500, currency: 'usd', reason: null, created: 1_700_000_000 }] },
        metadata: { scope: JSON.stringify({ account: 'acct_refund' }) },
      }),
      publishes: false,
    },
    {
      type: 'charge.dispute.created',
      setup: async () => {
        await activate('dispute')
        t.stripeState.charges.set('ch_dispute', { id: 'ch_dispute', customer: 'cus_dispute' })
      },
      object: () => ({ id: 'dp_1', charge: 'ch_dispute', amount: 1000, currency: 'usd', reason: 'fraudulent', status: 'needs_response' }),
      publishes: true,
    },
    {
      type: 'charge.dispute.closed',
      setup: async () => {
        await activate('won')
        t.stripeState.charges.set('ch_won', { id: 'ch_won', customer: 'cus_won' })
        await post(stripeEvent('charge.dispute.created', { id: 'dp_won', charge: 'ch_won', amount: 1000, currency: 'usd', reason: 'fraudulent', status: 'needs_response' }))
      },
      object: () => ({ id: 'dp_won', charge: 'ch_won', amount: 1000, currency: 'usd', reason: 'fraudulent', status: 'won' }),
      publishes: true,
    },
    { type: 'account.updated', object: () => ({}), publishes: false },
  ]

  for (const c of cases) {
    it(`a redelivered ${c.type} answers 200, runs no handler, and publishes nothing more`, async () => {
      await c.setup?.()
      const before = t.publisher.published.length
      const afterFirst = await deliverTwice(stripeEvent(c.type, c.object()))
      if (c.publishes) {
        expect(afterFirst).toBeGreaterThan(before)
      } else {
        expect(afterFirst).toBe(before)
      }
    })
  }

  it('records the handled event against the tenant and its Stripe event id', async () => {
    await post(stripeEvent('account.updated', {}, 'evt_recorded'))
    const instance = await t.consequent.fetch('stripeEvent', 'acme:evt_recorded')
    expect(instance!.state).toMatchObject({ tenant: 'acme', stripeEventId: 'evt_recorded', type: 'account.updated' })
  })

  it('refuses an event with no id rather than handling it unguarded', async () => {
    const response = await post(JSON.stringify({ type: 'account.updated', data: { object: {} } }))
    expect(response.statusCode).toBe(400)
  })

  it('does not record an event whose handler failed, so its redelivery runs the handler', async () => {
    await activate('retry')
    const payload = stripeEvent('charge.dispute.created', { id: 'dp_retry', charge: 'ch_retry', amount: 1000, currency: 'usd', reason: 'fraudulent', status: 'needs_response' })

    // Stripe cannot find the charge yet: the handler throws, and keep answers 500.
    const failed = await post(payload)
    expect(failed.statusCode).toBe(500)
    const instance = await t.consequent.fetch('stripeEvent', `acme:${JSON.parse(payload).id}`)
    expect((instance!.state as { processedAt: string }).processedAt).toBe('')
    const publishedAfterFailure = t.publisher.published.length

    t.stripeState.charges.set('ch_retry', { id: 'ch_retry', customer: 'cus_retry' })
    const retried = await post(payload)
    expect(retried.statusCode).toBe(200)
    expect(retried.json()).toEqual({ received: true })
    const revoked = t.publisher.published.slice(publishedAfterFailure).filter((e) => e.type === 'entitlement.role-revoked')
    expect(revoked).toHaveLength(PLAN_ROLES.length)
  })

  // Two events with different ids that activate one subscription:
  // `customer.subscription.created` and `checkout.session.completed`. The
  // id guard lets both through; the activation publishes only the first time.
  it('publishes one activation when created and checkout.session.completed both arrive for one subscription', async () => {
    t.stripeState.subscriptions.set('sub_both', {
      id: 'sub_both', customer: 'cus_both', status: 'active', currentPeriodEnd: 1_700_000_000, stripePriceId: 'price_basic',
      metadata: { scope: JSON.stringify({ account: 'acct_both' }) },
    })
    await post(stripeEvent('customer.subscription.created', subscriptionObject('both', 'active')))
    const afterCreated = t.publisher.published.length
    expect(t.publisher.published.filter((e) => e.type === 'entitlement.converted-to-paid')).toHaveLength(1)
    expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')).toHaveLength(PLAN_ROLES.length)

    const response = await post(stripeEvent('checkout.session.completed', { id: 'cs_both', customer: 'cus_both', subscription: 'sub_both' }))
    expect(response.statusCode).toBe(200)
    expect(t.publisher.published).toHaveLength(afterCreated)

    const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions', headers: readHeaders })
    expect(list.json().filter((s: { stripeSubscriptionId: string }) => s.stripeSubscriptionId === 'sub_both')).toHaveLength(1)
  })
})
