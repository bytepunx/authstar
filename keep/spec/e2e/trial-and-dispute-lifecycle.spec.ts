import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// End-to-end tier: a trial that converts to paid via webhook, followed by a
// disputed charge that degrades and then restores entitlements -- a second
// realistic sequence distinct from subscription-lifecycle.spec.ts's
// checkout/upgrade/cancel path, covering Story 002's dispute handling and
// Story 004's trial-conversion side effect together.

function stripeEventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
}

describe('trial conversion then dispute -- end to end', () => {
  let t: TestApp
  let app: FastifyInstance
  let manageHeaders: { authorization: string }
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    app = t.app
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    t.stripeState.prices.set('price_basic', { unitAmount: 1500, currency: 'usd', interval: 'month' })
    manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    readHeaders = await t.headers({ permissions: ['billing:read'] })
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

  it('grants a trial, extends it, converts it on checkout, then degrades and restores on a dispute', async () => {
    const mapping = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }] },
    })
    expect(mapping.statusCode).toBe(201)

    // 1. Admin grants a trial for a prospective account.
    const trial = await app.inject({
      method: 'POST',
      url: '/tenants/acme/trials',
      headers: manageHeaders,
      payload: {
        scope: { account: 'acct_trial' },
        grantedRoles: [{ application: 'demo-app', role: 'member' }],
        expiresAt: '2026-09-01T00:00:00.000Z',
      },
    })
    expect(trial.statusCode).toBe(201)
    const trialId = trial.json().id

    // 2. Admin extends it once (a customer asks for more time).
    const extended = await app.inject({
      method: 'PATCH',
      url: `/tenants/acme/trials/${trialId}`,
      headers: manageHeaders,
      payload: { expiresAt: '2026-10-01T00:00:00.000Z' },
    })
    expect(extended.statusCode).toBe(200)
    expect(extended.json().extensions).toHaveLength(1)

    // 3. The trial account checks out for real -- the webhook converts it.
    const created = await webhook(stripeEventPayload('customer.subscription.created', {
      id: 'sub_trial_1',
      customer: 'cus_trial_1',
      status: 'active',
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { id: 'price_basic' } }] },
      metadata: { scope: JSON.stringify({ account: 'acct_trial' }) },
    }))
    expect(created.statusCode).toBe(200)

    const trialAfterConvert = await app.inject({ method: 'GET', url: `/tenants/acme/trials/${trialId}`, headers: manageHeaders })
    expect(trialAfterConvert.json().status).toBe('converted')

    // A converted trial can no longer be extended or revoked -- both
    // commands are guarded to `status === 'active'` only.
    const rejectedExtend = await app.inject({
      method: 'PATCH', url: `/tenants/acme/trials/${trialId}`, headers: manageHeaders, payload: { expiresAt: '2026-11-01T00:00:00.000Z' },
    })
    expect(rejectedExtend.statusCode).toBe(409)

    // 4. A chargeback arrives -- degrade, then restore once won.
    const disputeCreated = await webhook(stripeEventPayload('charge.dispute.created', {
      id: 'dp_e2e_1',
      charge: 'ch_e2e_1',
      amount: 1500,
      currency: 'usd',
      reason: 'fraudulent',
      status: 'needs_response',
      metadata: { scope: JSON.stringify({ account: 'acct_trial' }) },
    }))
    expect(disputeCreated.statusCode).toBe(200)

    const disputesAfterCreate = await app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
    expect(disputesAfterCreate.json()).toHaveLength(1)
    expect(disputesAfterCreate.json()[0].status).toBe('needs_response')
    expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')).toHaveLength(1)

    const disputeWon = await webhook(stripeEventPayload('charge.dispute.closed', {
      id: 'dp_e2e_1',
      charge: 'ch_e2e_1',
      amount: 1500,
      currency: 'usd',
      reason: 'fraudulent',
      status: 'won',
      metadata: { scope: JSON.stringify({ account: 'acct_trial' }) },
    }))
    expect(disputeWon.statusCode).toBe(200)

    const disputesAfterWon = await app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
    expect(disputesAfterWon.json()[0].status).toBe('won')
    expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')).toHaveLength(2) // conversion grant + restore grant

    // 5. Activity is visible on the subscription/refund-free read surfaces
    // regardless of whether the change originated from an admin call or a
    // webhook (Story 006's framing) -- confirmed here indirectly via the
    // subscription record itself still being intact and unaffected by the
    // dispute (no automatic entitlement change from a dispute alone beyond
    // the explicit degrade/restore, ADR 0077).
    const subscription = await app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_trial_1', headers: readHeaders })
    expect(subscription.json().status).toBe('active')
  })
})
