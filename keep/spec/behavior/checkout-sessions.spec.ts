import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md
// ("Checkout Sessions").

describe('checkout sessions -- API contract', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
  })

  afterEach(async () => {
    await t.app.close()
  })

  async function createMapping() {
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      payload: { stripePriceId: 'price_basic', name: 'Basic' },
    })
    return response.json()
  }

  it('creates a checkout session with no existing customer, using customerEmail', async () => {
    const mapping = await createMapping()

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: mapping.id,
        scope: { account: 'acct_1' },
        customerEmail: 'buyer@example.com',
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.url).toContain('checkout.stripe.test')
    expect(t.stripeState.checkoutSessions).toHaveLength(1)
    expect(t.stripeState.checkoutSessions[0].customerEmail).toBe('buyer@example.com')
    expect(t.stripeState.checkoutSessions[0].stripeCustomerId).toBeUndefined()
  })

  it('reuses the existing Stripe customer for a scope that already has one, rather than creating a duplicate', async () => {
    const mapping = await createMapping()

    // Simulate an existing customer record the way Story 002's webhook
    // handling would have created it on a prior completed checkout.
    await t.consequent.handle('cust_1', 'customer.create', {
      id: 'cust_1',
      tenant: 'acme',
      scope: { account: 'acct_2' },
      stripeCustomerId: 'cus_existing',
    })

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: mapping.id,
        scope: { account: 'acct_2' },
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(t.stripeState.checkoutSessions[0].stripeCustomerId).toBe('cus_existing')
  })

  it('returns 404 for a plan mapping that does not exist', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: 'nonexistent',
        scope: { account: 'acct_3' },
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 409 for a retired plan mapping', async () => {
    const mapping = await createMapping()
    await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${mapping.id}` })

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: mapping.id,
        scope: { account: 'acct_4' },
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })
    expect(response.statusCode).toBe(409)
  })

  it('rejects a body with both account and tenant scope at the schema level', async () => {
    const mapping = await createMapping()

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/checkout-sessions',
      payload: {
        planMappingId: mapping.id,
        scope: { account: 'acct_5', tenant: 'acme' },
        successUrl: 'https://acme.example.com/success',
        cancelUrl: 'https://acme.example.com/cancel',
      },
    })
    expect(response.statusCode).toBe(400)
  })
})
