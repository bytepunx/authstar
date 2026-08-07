import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md
// ("Read-only billing surfaces"). Every route here is entirely webhook/
// event-sourced-populated -- these tests seed state directly via
// `consequent.handle()` (no admin write routes exist for any of these
// actors) and assert the read surface's contract.

describe('billing read surfaces -- API contract', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('GET /tenants/:tenantSlug/customer', () => {
    it('returns the tenant-scoped customer, 404 if none exists', async () => {
      const missing = await t.app.inject({ method: 'GET', url: '/tenants/acme/customer' })
      expect(missing.statusCode).toBe(404)

      await t.consequent.handle('cust_1', 'customer.create', { id: 'cust_1', tenant: 'acme', scope: { tenant: 'acme' }, stripeCustomerId: 'cus_1' })

      const found = await t.app.inject({ method: 'GET', url: '/tenants/acme/customer' })
      expect(found.statusCode).toBe(200)
      expect(found.json().stripeCustomerId).toBe('cus_1')
    })
  })

  describe('GET /tenants/:tenantSlug/accounts/:accountId/customer', () => {
    it('returns the account-scoped customer', async () => {
      await t.consequent.handle('cust_2', 'customer.create', { id: 'cust_2', tenant: 'acme', scope: { account: 'acct_1' }, stripeCustomerId: 'cus_2' })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct_1/customer' })
      expect(response.statusCode).toBe(200)
      expect(response.json().stripeCustomerId).toBe('cus_2')

      const wrongAccount = await t.app.inject({ method: 'GET', url: '/tenants/acme/accounts/nonexistent/customer' })
      expect(wrongAccount.statusCode).toBe(404)
    })
  })

  describe('GET /tenants/:tenantSlug/subscriptions', () => {
    it('lists subscriptions for the tenant only', async () => {
      await t.consequent.handle('sub_1', 'subscription.create', {
        stripeSubscriptionId: 'sub_1', tenant: 'acme', scope: { account: 'acct_1' },
        stripePriceId: 'price_1', status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })
      await t.consequent.handle('sub_2', 'subscription.create', {
        stripeSubscriptionId: 'sub_2', tenant: 'other', scope: { account: 'acct_1' },
        stripePriceId: 'price_1', status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions' })
      const body = response.json()
      expect(body).toHaveLength(1)
      expect(body[0].stripeSubscriptionId).toBe('sub_1')
    })
  })

  describe('GET /tenants/:tenantSlug/subscriptions/:id', () => {
    it('returns 404 for a cross-tenant subscription id (404, not 403)', async () => {
      await t.consequent.handle('sub_3', 'subscription.create', {
        stripeSubscriptionId: 'sub_3', tenant: 'acme', scope: { account: 'acct_1' },
        stripePriceId: 'price_1', status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/other/subscriptions/sub_3' })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /tenants/:tenantSlug/refunds and /disputes', () => {
    it('lists refunds and disputes, read-only, scoped to the tenant', async () => {
      await t.consequent.handle('re_1', 'refund.create', {
        stripeRefundId: 're_1', tenant: 'acme', scope: { tenant: 'acme' },
        stripeChargeId: 'ch_1', amount: 500, currency: 'usd', reason: 'requested_by_customer', refundedAt: '2026-01-01T00:00:00.000Z',
      })
      await t.consequent.handle('dp_1', 'dispute.create', {
        stripeDisputeId: 'dp_1', tenant: 'acme', scope: { tenant: 'acme' },
        stripeChargeId: 'ch_2', amount: 750, currency: 'usd', reason: 'fraudulent',
      })

      const refunds = await t.app.inject({ method: 'GET', url: '/tenants/acme/refunds' })
      expect(refunds.json()).toHaveLength(1)

      const disputes = await t.app.inject({ method: 'GET', url: '/tenants/acme/disputes' })
      expect(disputes.json()).toHaveLength(1)
      expect(disputes.json()[0].status).toBe('needs_response')
    })
  })

  describe('GET /tenants/:tenantSlug/revenue-summary', () => {
    it('computes MRR from active subscriptions using cached plan-mapping pricing, normalizing yearly to monthly', async () => {
      t.stripeState.prices.set('price_monthly', { unitAmount: 1000, currency: 'usd', interval: 'month' })
      t.stripeState.prices.set('price_yearly', { unitAmount: 12000, currency: 'usd', interval: 'year' })
      await t.stripeConfig.set('acme', { secretKey: 'sk_test', webhookSecret: 'whsec_test' })

      const monthly = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/plan-mappings', payload: { stripePriceId: 'price_monthly', name: 'Monthly' },
      })).json()
      const yearly = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/plan-mappings', payload: { stripePriceId: 'price_yearly', name: 'Yearly' },
      })).json()

      await t.consequent.handle('sub_a', 'subscription.create', {
        stripeSubscriptionId: 'sub_a', tenant: 'acme', scope: { account: 'acct_a' },
        stripePriceId: monthly.stripePriceId, status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })
      await t.consequent.handle('sub_b', 'subscription.create', {
        stripeSubscriptionId: 'sub_b', tenant: 'acme', scope: { account: 'acct_b' },
        stripePriceId: yearly.stripePriceId, status: 'active', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })
      await t.consequent.handle('sub_c', 'subscription.create', {
        stripeSubscriptionId: 'sub_c', tenant: 'acme', scope: { account: 'acct_c' },
        stripePriceId: monthly.stripePriceId, status: 'canceled', currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/revenue-summary' })
      expect(response.statusCode).toBe(200)
      const body = response.json()

      // 1000 (monthly, active) + 12000/12=1000 (yearly, active) = 2000; the
      // canceled subscription contributes nothing to MRR.
      expect(body.mrr).toBe(2000)
      expect(body.activeCount).toBe(2)
      expect(body.byStatus).toEqual({ active: 2, canceled: 1 })
    })
  })
})
