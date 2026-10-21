import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'
import { pickSubscription } from '../../src/routes/me.js'
import type { SubscriptionState } from '../../src/actors/subscription_actor.js'

// Behavior tier: design/stories/keep/006 ("GET /me/subscription") and ADR 0071.
// Tenant and account come from the forwarded internal JWT, never the URL.

async function seedSubscription(t: TestApp, id: string, overrides: Partial<SubscriptionState> = {}) {
  await t.consequent.handle(id, 'subscription.create', {
    stripeSubscriptionId: id,
    tenant: 'acme',
    scope: { account: 'acct_1' },
    stripePriceId: 'price_1',
    status: 'active',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    ...overrides,
  })
}

async function seedPlan(t: TestApp, id: string, stripePriceId: string, name: string, tenant = 'acme') {
  await t.consequent.handle(id, 'planMapping.create', {
    id, tenant, stripePriceId, name, seatLimit: null, grantedRoles: [], meter: null,
  })
}

describe('GET /me/subscription', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
  })

  afterEach(async () => {
    await t.app.close()
  })

  it('returns status, plan name, and period end for the caller\'s own account-scoped subscription', async () => {
    await seedPlan(t, 'pm_1', 'price_1', 'Pro')
    await seedSubscription(t, 'sub_1')
    const headers = await t.headers({ accountId: 'acct_1' })

    const response = await t.app.inject({ method: 'GET', url: '/me/subscription', headers })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'active', planName: 'Pro', currentPeriodEnd: '2026-12-01T00:00:00.000Z' })
  })

  it('returns nulls, not 404, when the account has no subscription', async () => {
    const headers = await t.headers({ accountId: 'acct_1' })
    const response = await t.app.inject({ method: 'GET', url: '/me/subscription', headers })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: null, planName: null, currentPeriodEnd: null })
  })

  it('never shows another account\'s or another tenant\'s subscription', async () => {
    await seedSubscription(t, 'sub_other_account', { scope: { account: 'acct_2' } })
    await seedSubscription(t, 'sub_other_tenant', { tenant: 'other' })
    const headers = await t.headers({ accountId: 'acct_1' })
    const response = await t.app.inject({ method: 'GET', url: '/me/subscription', headers })
    expect(response.json().status).toBeNull()
  })

  it('gives a null plan name when the price has no plan mapping', async () => {
    await seedSubscription(t, 'sub_1', { stripePriceId: 'price_unmapped' })
    const headers = await t.headers({ accountId: 'acct_1' })
    const response = await t.app.inject({ method: 'GET', url: '/me/subscription', headers })
    expect(response.json()).toEqual({ status: 'active', planName: null, currentPeriodEnd: '2026-12-01T00:00:00.000Z' })
  })

  it('prefers a live subscription over a canceled one for the same account', async () => {
    await seedPlan(t, 'pm_old', 'price_old', 'Old')
    await seedPlan(t, 'pm_new', 'price_new', 'New')
    await seedSubscription(t, 'sub_new', { stripePriceId: 'price_new', status: 'past_due' })
    await seedSubscription(t, 'sub_old', { stripePriceId: 'price_old', status: 'canceled' })
    const headers = await t.headers({ accountId: 'acct_1' })
    const response = await t.app.inject({ method: 'GET', url: '/me/subscription', headers })
    expect(response.json()).toMatchObject({ status: 'past_due', planName: 'New' })
  })

  it('is 403 without a token, with a degraded token, and with a token that has no account', async () => {
    const none = await t.app.inject({ method: 'GET', url: '/me/subscription' })
    expect(none.statusCode).toBe(403)

    const degraded = await t.app.inject({ method: 'GET', url: '/me/subscription', headers: await t.headers({ accountId: 'acct_1', enrichmentStatus: 'degraded' }) })
    expect(degraded.statusCode).toBe(403)

    const noAccount = await t.app.inject({ method: 'GET', url: '/me/subscription', headers: await t.headers({}) })
    expect(noAccount.statusCode).toBe(403)
  })
})

describe('pickSubscription', () => {
  const base = { tenant: 'acme', scope: { account: 'a' }, stripePriceId: 'p', currentPeriodEnd: '' } as const
  it('returns undefined for no subscriptions', () => {
    expect(pickSubscription([])).toBeUndefined()
  })
  it('returns the newest ended subscription when none is live', () => {
    const picked = pickSubscription([
      { ...base, stripeSubscriptionId: 'a', status: 'canceled', createdAt: '2026-01-01T00:00:00.000Z' },
      { ...base, stripeSubscriptionId: 'b', status: 'canceled', createdAt: '2026-02-01T00:00:00.000Z' },
    ])
    expect(picked?.stripeSubscriptionId).toBe('b')
  })
})
