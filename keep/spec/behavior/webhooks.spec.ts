import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: the public HTTP contract for
// design/stories/keep/002-stripe-webhook-handling.md. Signature
// verification uses the fake Stripe client's sentinel scheme
// (`valid:<webhookSecret>`, spec/lib/fake-stripe-client.ts) -- proves
// keep's own dispatch logic, not Stripe's HMAC implementation.

function stripeEventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } })
}

describe('stripe webhook handling -- API contract', () => {
  let t: TestApp
  let readHeaders: { authorization: string }
  let manageHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    readHeaders = await t.headers({ permissions: ['billing:read'] })
    manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    t.stripeState.prices.set('price_pro', { unitAmount: 5000, currency: 'usd', interval: 'month' })

    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }], seatLimit: 5 },
    })
  })

  afterEach(async () => {
    await t.app.close()
  })

  async function post(payload: string, signature = 'valid:whsec_acme') {
    return t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': signature, 'content-type': 'application/json' },
      payload,
    })
  }

  it('rejects a request with no tenant header at the schema level', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload('account.updated', {}),
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an unknown tenant (404) -- no stripe configuration to verify against', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'unconfigured', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload: stripeEventPayload('account.updated', {}),
    })
    expect(response.statusCode).toBe(404)
  })

  it('rejects an invalid signature outright (400), never processed', async () => {
    const response = await post(stripeEventPayload('account.updated', {}), 'wrong-signature')
    expect(response.statusCode).toBe(400)
  })

  it('receives and ignores account.updated -- never applies, not an error', async () => {
    const response = await post(stripeEventPayload('account.updated', {}))
    expect(response.statusCode).toBe(200)
  })

  describe('customer.subscription.created', () => {
    it('creates customer + subscription, publishes converted-to-paid and one role-granted per role', async () => {
      const response = await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_1' }) },
      }))
      expect(response.statusCode).toBe(200)

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_1', headers: readHeaders })
      expect(sub.statusCode).toBe(200)
      expect(sub.json().status).toBe('active')
      expect(sub.json().stripePriceId).toBe('price_basic')

      const customer = await t.app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct_1/customer', headers: readHeaders })
      expect(customer.statusCode).toBe(200)
      expect(customer.json().stripeCustomerId).toBe('cus_1')

      const publishedTypes = t.publisher.published.map((e) => e.type)
      expect(publishedTypes).toContain('entitlement.converted-to-paid')
      expect(publishedTypes).toContain('entitlement.role-granted')
      // seatLimit is only meaningful for tenant scope (Story 001's own
      // caveat on the field) -- this subscription is account-scoped, so no
      // seat-limit-changed event, even though the plan mapping sets one.
      expect(publishedTypes).not.toContain('entitlement.seat-limit-changed')

      // Story 002: all events for one (tenant, scope) share one
      // monotonically-increasing sequence, not one per event type.
      const sequences = t.publisher.published.map((e) => e.sequence)
      expect(new Set(sequences).size).toBe(sequences.length)
      expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
    })

    it('publishes seat-limit-changed for a tenant-scoped subscription (seatLimit is only meaningful for tenant scope)', async () => {
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_seat',
        customer: 'cus_seat',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ tenant: 'acme' }) },
      }))

      const seatEvent = t.publisher.published.find((e) => e.type === 'entitlement.seat-limit-changed')
      expect(seatEvent).toBeDefined()
      expect((seatEvent as { seatLimit: number }).seatLimit).toBe(5)
    })

    it('is idempotent against a redelivered event for the same subscription id', async () => {
      const payload = stripeEventPayload('customer.subscription.created', {
        id: 'sub_2',
        customer: 'cus_2',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_2' }) },
      })
      await post(payload)
      await post(payload)

      const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions', headers: readHeaders })
      expect(list.json().filter((s: { stripeSubscriptionId: string }) => s.stripeSubscriptionId === 'sub_2')).toHaveLength(1)
    })

    it('converts an in-progress trial for the same scope', async () => {
      const trial = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/trials',
        headers: manageHeaders,
        payload: { scope: { account: 'acct_3' }, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
      })
      const trialId = trial.json().id

      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_3',
        customer: 'cus_3',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_3' }) },
      }))

      const updatedTrial = await t.app.inject({ method: 'GET', url: `/tenants/acme/trials/${trialId}`, headers: manageHeaders })
      expect(updatedTrial.json().status).toBe('converted')
    })
  })

  // ADR 0098: organization-scoped subscriptions resolve entitlement fan-out
  // to the organization's current managers (from `t.organizationManagers`,
  // seeded here the same way production's organization-reference-consumer.ts
  // would), not to every member -- and not to nobody, which was the prior
  // behavior this ADR fixes.
  describe('organization-scoped subscription activation (ADR 0098)', () => {
    it('publishes one role-granted per role per manager, not once for the organization', async () => {
      t.organizationManagers.addManager('org_1', 'mgr_1')
      t.organizationManagers.addManager('org_1', 'mgr_2')

      const response = await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_org_1',
        customer: 'cus_org_1',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ organization: 'org_1' }) },
      }))
      expect(response.statusCode).toBe(200)

      const roleGrants = t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')
      expect(roleGrants).toHaveLength(2)
      const scopes = roleGrants.map((e) => (e as unknown as { scope: { account: string } }).scope.account).sort()
      expect(scopes).toEqual(['mgr_1', 'mgr_2'])

      const convertedToPaid = t.publisher.published.filter((e) => e.type === 'entitlement.converted-to-paid')
      expect(convertedToPaid).toHaveLength(2)
    })

    it('publishes nothing for an organization keep has no manager-cache entry for yet -- not an error', async () => {
      const response = await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_org_2',
        customer: 'cus_org_2',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ organization: 'org_unknown' }) },
      }))
      expect(response.statusCode).toBe(200)
      expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')).toHaveLength(0)
    })

    it('revokes from every manager on cancellation', async () => {
      t.organizationManagers.addManager('org_3', 'mgr_3')
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_org_3',
        customer: 'cus_org_3',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ organization: 'org_3' }) },
      }))

      const response = await post(stripeEventPayload('customer.subscription.deleted', {
        id: 'sub_org_3',
        customer: 'cus_org_3',
        status: 'canceled',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
      }))
      expect(response.statusCode).toBe(200)

      const revoked = t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')
      expect(revoked).toHaveLength(1)
      expect((revoked[0] as unknown as { scope: { account: string } }).scope.account).toBe('mgr_3')
    })
  })

  describe('checkout.session.completed', () => {
    it('retrieves the full subscription via the Stripe client and processes it the same as customer.subscription.created', async () => {
      t.stripeState.subscriptions.set('sub_cs_1', {
        id: 'sub_cs_1',
        customer: 'cus_cs_1',
        status: 'active',
        currentPeriodEnd: 1_700_000_000,
        stripePriceId: 'price_basic',
        metadata: { scope: JSON.stringify({ account: 'acct_cs_1' }) },
      })

      const response = await post(stripeEventPayload('checkout.session.completed', {
        id: 'cs_1',
        customer: 'cus_cs_1',
        subscription: 'sub_cs_1',
      }))
      expect(response.statusCode).toBe(200)

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_cs_1', headers: readHeaders })
      expect(sub.statusCode).toBe(200)
      expect(sub.json().stripePriceId).toBe('price_basic')
    })
  })

  describe('customer.subscription.updated', () => {
    it('publishes the granted/revoked role delta between the old and new plan, not a full re-grant', async () => {
      await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers: manageHeaders,
        payload: { stripePriceId: 'price_pro', name: 'Pro', grantedRoles: [{ application: 'demo-app', role: 'admin' }] },
      })

      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_4',
        customer: 'cus_4',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_4' }) },
      }))
      t.publisher.published.length = 0 // only care about the upgrade's own events below

      await post(stripeEventPayload('customer.subscription.updated', {
        id: 'sub_4',
        customer: 'cus_4',
        status: 'active',
        current_period_end: 1_700_100_000,
        items: { data: [{ price: { id: 'price_pro' } }] },
      }))

      const granted = t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')
      const revoked = t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')
      expect(granted).toHaveLength(1)
      expect((granted[0] as { role: { name: string } }).role.name).toBe('admin')
      expect(revoked).toHaveLength(1)
      expect((revoked[0] as { role: { name: string } }).role.name).toBe('member')

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_4', headers: readHeaders })
      expect(sub.json().stripePriceId).toBe('price_pro')
    })
  })

  describe('customer.subscription.deleted', () => {
    it('cancels the subscription and revokes every role the plan granted', async () => {
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_5',
        customer: 'cus_5',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_5' }) },
      }))
      t.publisher.published.length = 0

      const response = await post(stripeEventPayload('customer.subscription.deleted', {
        id: 'sub_5',
        customer: 'cus_5',
        status: 'canceled',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
      }))
      expect(response.statusCode).toBe(200)

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_5', headers: readHeaders })
      expect(sub.json().status).toBe('canceled')

      const revoked = t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')
      expect(revoked).toHaveLength(1)
    })
  })

  describe('customer.subscription.paused / .resumed', () => {
    it('revokes granted roles on pause, without touching price or canceling the subscription', async () => {
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_pause_1',
        customer: 'cus_pause_1',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_pause_1' }) },
      }))
      t.publisher.published.length = 0

      const response = await post(stripeEventPayload('customer.subscription.paused', {
        id: 'sub_pause_1',
        customer: 'cus_pause_1',
        status: 'paused',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
      }))
      expect(response.statusCode).toBe(200)

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_pause_1', headers: readHeaders })
      expect(sub.json().status).toBe('paused')
      expect(sub.json().stripePriceId).toBe('price_basic')

      const revoked = t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')
      expect(revoked).toHaveLength(1)
      expect((revoked[0] as { role: { name: string } }).role.name).toBe('member')
    })

    it('re-grants roles on resume', async () => {
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_resume_1',
        customer: 'cus_resume_1',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_resume_1' }) },
      }))
      await post(stripeEventPayload('customer.subscription.paused', {
        id: 'sub_resume_1',
        customer: 'cus_resume_1',
        status: 'paused',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
      }))
      t.publisher.published.length = 0

      const response = await post(stripeEventPayload('customer.subscription.resumed', {
        id: 'sub_resume_1',
        customer: 'cus_resume_1',
        status: 'active',
        current_period_end: 1_700_200_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
      }))
      expect(response.statusCode).toBe(200)

      const sub = await t.app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_resume_1', headers: readHeaders })
      expect(sub.json().status).toBe('active')

      const granted = t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')
      expect(granted).toHaveLength(1)
      expect((granted[0] as { role: { name: string } }).role.name).toBe('member')
    })
  })

  describe('charge.refunded', () => {
    it('creates a refund record and publishes no entitlement event -- visibility only', async () => {
      const response = await post(stripeEventPayload('charge.refunded', {
        id: 'ch_1',
        customer: 'cus_6',
        refunds: { data: [{ id: 're_1', amount: 500, currency: 'usd', reason: 'requested_by_customer', created: 1_700_000_000 }] },
        metadata: { scope: JSON.stringify({ tenant: 'acme' }) },
      }))
      expect(response.statusCode).toBe(200)

      const refunds = await t.app.inject({ method: 'GET', url: '/tenants/acme/refunds', headers: readHeaders })
      expect(refunds.json()).toHaveLength(1)
      expect(refunds.json()[0].stripeRefundId).toBe('re_1')
      expect(refunds.json()[0].amount).toBe(500)

      expect(t.publisher.published).toHaveLength(0)
    })
  })

  describe('charge.dispute.created / charge.dispute.closed', () => {
    it('creates a dispute, degrades roles, then restores them when the dispute is won', async () => {
      await post(stripeEventPayload('customer.subscription.created', {
        id: 'sub_7',
        customer: 'cus_7',
        status: 'active',
        current_period_end: 1_700_000_000,
        items: { data: [{ price: { id: 'price_basic' } }] },
        metadata: { scope: JSON.stringify({ account: 'acct_7' }) },
      }))
      t.publisher.published.length = 0

      const created = await post(stripeEventPayload('charge.dispute.created', {
        id: 'dp_1',
        charge: 'ch_2',
        amount: 1000,
        currency: 'usd',
        reason: 'fraudulent',
        status: 'needs_response',
        metadata: { scope: JSON.stringify({ account: 'acct_7' }) },
      }))
      expect(created.statusCode).toBe(200)

      const dispute = await t.app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
      expect(dispute.json()[0].status).toBe('needs_response')
      expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')).toHaveLength(1)

      const closed = await post(stripeEventPayload('charge.dispute.closed', {
        id: 'dp_1',
        charge: 'ch_2',
        amount: 1000,
        currency: 'usd',
        reason: 'fraudulent',
        status: 'won',
        metadata: { scope: JSON.stringify({ account: 'acct_7' }) },
      }))
      expect(closed.statusCode).toBe(200)

      const disputeAfter = await t.app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
      expect(disputeAfter.json()[0].status).toBe('won')
      expect(t.publisher.published.filter((e) => e.type === 'entitlement.role-granted')).toHaveLength(1)
    })

    it('a lost dispute updates the record only -- no entitlement action', async () => {
      await post(stripeEventPayload('charge.dispute.created', {
        id: 'dp_2',
        charge: 'ch_3',
        amount: 750,
        currency: 'usd',
        reason: 'fraudulent',
        status: 'needs_response',
        metadata: { scope: JSON.stringify({ tenant: 'acme' }) },
      }))
      t.publisher.published.length = 0

      await post(stripeEventPayload('charge.dispute.closed', {
        id: 'dp_2',
        charge: 'ch_3',
        amount: 750,
        currency: 'usd',
        reason: 'fraudulent',
        status: 'lost',
        metadata: { scope: JSON.stringify({ tenant: 'acme' }) },
      }))

      const dispute = await t.app.inject({ method: 'GET', url: '/tenants/acme/disputes', headers: readHeaders })
      expect(dispute.json().find((d: { stripeDisputeId: string }) => d.stripeDisputeId === 'dp_2').status).toBe('lost')
      expect(t.publisher.published).toHaveLength(0)
    })
  })
})
