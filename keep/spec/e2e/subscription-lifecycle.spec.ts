import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// End-to-end tier: a full, realistic billing lifecycle exercised through
// the HTTP surface -- admin configures Stripe and a plan mapping, a
// customer checks out (Stripe webhook simulated the way it would arrive
// via portcullis's reserved path), upgrades, then cancels -- covering
// Stories 002 and 003 together the way a real operator/webhook sequence
// would, not any one route's contract in isolation. Same in-memory
// consequent/fake-Stripe wiring as the behavior tier.

function stripeEventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
}

describe('subscription lifecycle -- checkout, upgrade, cancel, end to end', () => {
  let t: TestApp
  let app: FastifyInstance

  beforeEach(async () => {
    t = await buildTestApp()
    app = t.app
  })

  afterEach(async () => {
    await app.close()
  })

  async function webhook(payload: string) {
    return app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload,
    })
  }

  it('walks stripe-config -> plan mapping -> checkout -> subscription webhook -> upgrade -> cancel, all via HTTP', async () => {
    // 1. Admin connects Stripe.
    t.stripeState.validApiKeys.add('sk_live_acme')
    const config = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme/stripe-config',
      payload: { secretKey: 'sk_live_acme', webhookSecret: 'whsec_acme' },
    })
    expect(config.statusCode).toBe(200)

    // 2. Admin defines two plans.
    t.stripeState.prices.set('price_basic', { unitAmount: 900, currency: 'usd', interval: 'month' })
    t.stripeState.prices.set('price_pro', { unitAmount: 2900, currency: 'usd', interval: 'month' })

    const basic = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }] },
    })
    const pro = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      payload: { stripePriceId: 'price_pro', name: 'Pro', grantedRoles: [{ application: 'demo-app', role: 'member' }, { application: 'demo-app', role: 'admin' }] },
    })
    expect(basic.statusCode).toBe(201)
    expect(pro.statusCode).toBe(201)

    // 3. A checkout session is created for a new customer.
    const checkout = await app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: basic.json().id,
        scope: { account: 'acct_1' },
        customerEmail: 'buyer@example.com',
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })
    expect(checkout.statusCode).toBe(201)
    expect(t.stripeState.checkoutSessions).toHaveLength(1)

    // 4. Stripe confirms the checkout via webhook.
    const created = await webhook(stripeEventPayload('customer.subscription.created', {
      id: 'sub_e2e_1',
      customer: 'cus_e2e_1',
      status: 'active',
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { id: 'price_basic' } }] },
      metadata: { scope: JSON.stringify({ account: 'acct_1' }) },
    }))
    expect(created.statusCode).toBe(200)

    const afterCreate = await app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_e2e_1' })
    expect(afterCreate.json().status).toBe('active')
    expect(afterCreate.json().stripePriceId).toBe('price_basic')

    const customer = await app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct_1/customer' })
    expect(customer.statusCode).toBe(200)
    expect(customer.json().stripeCustomerId).toBe('cus_e2e_1')

    // A second checkout for the same account now reuses the Stripe
    // customer created above, rather than creating a duplicate.
    const secondCheckout = await app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: pro.json().id,
        scope: { account: 'acct_1' },
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })
    expect(t.stripeState.checkoutSessions[1].stripeCustomerId).toBe('cus_e2e_1')
    void secondCheckout

    // 5. The customer upgrades to Pro -- Stripe sends the update.
    const updated = await webhook(stripeEventPayload('customer.subscription.updated', {
      id: 'sub_e2e_1',
      customer: 'cus_e2e_1',
      status: 'active',
      current_period_end: 1_700_500_000,
      items: { data: [{ price: { id: 'price_pro' } }] },
    }))
    expect(updated.statusCode).toBe(200)

    const afterUpgrade = await app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_e2e_1' })
    expect(afterUpgrade.json().stripePriceId).toBe('price_pro')

    // Only the *delta* role (admin) was granted -- member was already
    // granted by the original plan and isn't re-published.
    const grantedRoleNames = t.publisher.published
      .filter((e) => e.type === 'entitlement.role-granted')
      .map((e) => (e as { role: { name: string } }).role.name)
    expect(grantedRoleNames).toEqual(['member', 'admin'])

    // 6. The customer cancels.
    const deleted = await webhook(stripeEventPayload('customer.subscription.deleted', {
      id: 'sub_e2e_1',
      customer: 'cus_e2e_1',
      status: 'canceled',
      current_period_end: 1_700_500_000,
      items: { data: [{ price: { id: 'price_pro' } }] },
    }))
    expect(deleted.statusCode).toBe(200)

    const final = await app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_e2e_1' })
    expect(final.json().status).toBe('canceled')

    const revokedRoleNames = t.publisher.published
      .filter((e) => e.type === 'entitlement.role-revoked')
      .map((e) => (e as { role: { name: string } }).role.name)
      .sort()
    expect(revokedRoleNames).toEqual(['admin', 'member'])

    // 7. Revenue summary reflects the canceled status, zero MRR.
    const revenue = await app.inject({ method: 'GET', url: '/tenants/acme/revenue-summary' })
    expect(revenue.json().activeCount).toBe(0)
    expect(revenue.json().byStatus.canceled).toBe(1)
  })
})
