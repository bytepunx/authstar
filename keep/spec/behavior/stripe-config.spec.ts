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
})
