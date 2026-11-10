import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/006-self-service-config-and-activity.md
// ("GET/PATCH .../stripe-config"), Story 001's "stripe-config" section.

describe('stripe-config -- API contract', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
  })

  afterEach(async () => {
    await t.app.close()
  })

  it('GET returns 404 before any config is set, never the secret itself once set', async () => {
    const headers = await t.headers({ permissions: ['billing:manage'] })
    const before = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
    expect(before.statusCode).toBe(404)

    t.stripeState.validApiKeys.add('sk_test_good')
    await t.app.inject({
      method: 'PATCH',
      url: '/tenants/acme/stripe-config',
      headers,
      payload: { secretKey: 'sk_test_good', webhookSecret: 'whsec_good' },
    })

    const after = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
    expect(after.statusCode).toBe(200)
    const body = after.json()
    expect(body.secretKey).toBeUndefined()
    expect(body.webhookSecret).toBeUndefined()
  })

  it('PATCH validates the key at set time, rejecting a bad key before it is ever stored', async () => {
    const headers = await t.headers({ permissions: ['billing:manage'] })
    // Deliberately not added to validApiKeys -- the fake Stripe client's
    // validateApiKey resolves false for anything it doesn't recognize,
    // simulating a bad/revoked key (ADR 0054).
    const response = await t.app.inject({
      method: 'PATCH',
      url: '/tenants/acme/stripe-config',
      headers,
      payload: { secretKey: 'sk_test_bad', webhookSecret: 'whsec_bad' },
    })
    expect(response.statusCode).toBe(400)

    const get = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
    expect(get.statusCode).toBe(404)
  })

  it('rejects with 403 when no bearer token is presented (Story 007)', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config' })
    expect(response.statusCode).toBe(403)
  })

  it('rejects with 403 when the token has an unrelated grant, not billing:manage', async () => {
    const headers = await t.headers({ permissions: ['activity:read'] })
    const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
    expect(response.statusCode).toBe(403)
  })

  it('rejects with 403 for a degraded token, even if permissions somehow contains the grant', async () => {
    const headers = await t.headers({ enrichmentStatus: 'degraded', permissions: ['billing:manage'] })
    const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
    expect(response.statusCode).toBe(403)
  })

  describe('paymentFailureAttempts (ADR 0107)', () => {
    it('GET reads 3 for a tenant that configured Stripe but never set the threshold', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      t.stripeState.validApiKeys.add('sk_test_good')
      await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { secretKey: 'sk_test_good', webhookSecret: 'whsec_good' },
      })

      const get = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
      expect(get.statusCode).toBe(200)
      expect(get.json()).toEqual({ configured: true, paymentFailureAttempts: 3 })
    })

    it('PATCH with paymentFailureAttempts: 1 alone stores it, and GET returns it', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      t.stripeState.validApiKeys.add('sk_test_good')
      await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { secretKey: 'sk_test_good', webhookSecret: 'whsec_good' },
      })

      const patch = await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { paymentFailureAttempts: 1 },
      })
      expect(patch.statusCode).toBe(200)
      expect(patch.json()).toEqual({ configured: true, paymentFailureAttempts: 1 })
      await expect(t.stripeConfig.getPaymentFailureAttempts('acme')).resolves.toBe(1)
      // The secrets set earlier are left as they were.
      await expect(t.stripeConfig.get('acme')).resolves.toEqual({ secretKey: 'sk_test_good', webhookSecret: 'whsec_good' })

      const get = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
      expect(get.json()).toEqual({ configured: true, paymentFailureAttempts: 1 })
    })

    it('PATCH takes the threshold beside the secrets in one request', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      t.stripeState.validApiKeys.add('sk_test_good')
      const patch = await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { secretKey: 'sk_test_good', webhookSecret: 'whsec_good', paymentFailureAttempts: 5 },
      })
      expect(patch.statusCode).toBe(200)
      expect(patch.json()).toEqual({ configured: true, paymentFailureAttempts: 5 })
    })

    it('a threshold set before the secrets is returned with configured: false', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { paymentFailureAttempts: 2 },
      })

      const get = await t.app.inject({ method: 'GET', url: '/tenants/acme/stripe-config', headers })
      expect(get.statusCode).toBe(200)
      expect(get.json()).toEqual({ configured: false, paymentFailureAttempts: 2 })
    })

    it.each([
      ['0', 0],
      ['a negative number', -1],
      ['a fraction', 1.5],
      ['a word', 'three'],
      ['null', null],
    ])('PATCH refuses %s with 400 and stores nothing', async (_label, value) => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      const patch = await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { paymentFailureAttempts: value },
      })
      expect(patch.statusCode).toBe(400)
      await expect(t.stripeConfig.getPaymentFailureAttempts('acme')).resolves.toBeUndefined()
    })

    it('PATCH refuses a bad key with 400 and stores neither the key nor the threshold beside it', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      const patch = await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { secretKey: 'sk_test_bad', webhookSecret: 'whsec_bad', paymentFailureAttempts: 1 },
      })
      expect(patch.statusCode).toBe(400)
      await expect(t.stripeConfig.getPaymentFailureAttempts('acme')).resolves.toBeUndefined()
    })

    it('PATCH refuses one secret without the other, and an empty body, with 400', async () => {
      const headers = await t.headers({ permissions: ['billing:manage'] })
      t.stripeState.validApiKeys.add('sk_test_good')
      const lone = await t.app.inject({
        method: 'PATCH',
        url: '/tenants/acme/stripe-config',
        headers,
        payload: { secretKey: 'sk_test_good', paymentFailureAttempts: 2 },
      })
      expect(lone.statusCode).toBe(400)

      const empty = await t.app.inject({ method: 'PATCH', url: '/tenants/acme/stripe-config', headers, payload: {} })
      expect(empty.statusCode).toBe(400)
      await expect(t.stripeConfig.get('acme')).resolves.toBeUndefined()
    })
  })
})
