import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/005-usage-records-and-credentials.md.

describe('usage records and credentials -- API contract', () => {
  let t: TestApp
  let manageHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    manageHeaders = await t.headers({ permissions: ['billing:manage'] })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test', webhookSecret: 'whsec_test' })
    t.stripeState.prices.set('price_metered', { unitAmount: 0, currency: 'usd', interval: 'month' })
    await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_metered', name: 'Metered', meter: 'api-calls' },
    })
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/usage-records', () => {
    it('records usage and publishes entitlement.usage-updated with the running period total', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'api-calls', quantity: 5, idempotencyKey: 'req-1' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().periodUsage).toBe(5)

      const published = t.publisher.published.find((e) => e.type === 'entitlement.usage-updated')
      expect(published).toBeDefined()
      expect((published as { periodUsage: number }).periodUsage).toBe(5)
    })

    it('rejects an unrecognized meter (400), not a silent no-op', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'nonexistent-meter', quantity: 1, idempotencyKey: 'req-2' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('a redelivered report with the same idempotencyKey is a no-op, not a double-charge', async () => {
      const first = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'api-calls', quantity: 10, idempotencyKey: 'req-dup' },
      })
      const second = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'api-calls', quantity: 10, idempotencyKey: 'req-dup' },
      })

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(200)

      const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/usage-records', headers: manageHeaders })
      expect(list.json()).toHaveLength(1)

      // Only one entitlement.usage-updated publish -- the redelivery never
      // reached the recording path at all.
      expect(t.publisher.published.filter((e) => e.type === 'entitlement.usage-updated')).toHaveLength(1)
    })

    it('two different idempotencyKeys accumulate into the running period total', async () => {
      await t.app.inject({
        method: 'POST', url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'api-calls', quantity: 3, idempotencyKey: 'req-a' },
      })
      const second = await t.app.inject({
        method: 'POST', url: '/tenants/acme/usage-records',
        payload: { application: 'demo-app', accountId: 'acct_1', meter: 'api-calls', quantity: 4, idempotencyKey: 'req-b' },
      })

      expect(second.json().periodUsage).toBe(7)
    })
  })

  describe('GET /tenants/:tenantSlug/usage-records', () => {
    it('filters by meter and application', async () => {
      await t.app.inject({
        method: 'POST', url: '/tenants/acme/usage-records',
        payload: { application: 'app-a', accountId: 'acct_1', meter: 'api-calls', quantity: 1, idempotencyKey: 'x1' },
      })
      await t.app.inject({
        method: 'POST', url: '/tenants/acme/usage-records',
        payload: { application: 'app-b', accountId: 'acct_1', meter: 'api-calls', quantity: 1, idempotencyKey: 'x2' },
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/usage-records?application=app-a', headers: manageHeaders })
      expect(response.json()).toHaveLength(1)
      expect(response.json()[0].application).toBe('app-a')
    })
  })

  describe('usage-reporting credentials', () => {
    it('issues a credential, returning the secret once, never again on list', async () => {
      const headers = await t.headers({ permissions: ['applications:manage'] })
      const issued = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })
      expect(issued.statusCode).toBe(201)
      expect(issued.json().secret).toBeTruthy()

      const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })
      expect(list.json()).toHaveLength(1)
      expect(list.json()[0].secret).toBeUndefined()
      expect(list.json()[0].credentialId).toBe(issued.json().credentialId)
    })

    it('supports multiple concurrent credentials -- revoking one leaves the other valid', async () => {
      const headers = await t.headers({ permissions: ['applications:manage'] })
      const first = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })
      const second = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })

      const revoke = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/applications/demo-app/usage-credentials/${first.json().credentialId}`, headers })
      expect(revoke.statusCode).toBe(204)

      const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })
      const statuses = Object.fromEntries(list.json().map((c: { credentialId: string, status: string }) => [c.credentialId, c.status]))
      expect(statuses[first.json().credentialId]).toBe('revoked')
      expect(statuses[second.json().credentialId]).toBe('active')
    })

    it('rejects revoking a credential for the wrong application (404)', async () => {
      const headers = await t.headers({ permissions: ['applications:manage'] })
      const issued = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/applications/other-app/usage-credentials/${issued.json().credentialId}`, headers })
      expect(response.statusCode).toBe(404)
    })

    it('rejects with 403 for billing:manage alone -- credential issuance needs applications:manage, a deliberately distinct grant (Story 005, not Story 007\'s own table -- see usage.ts)', async () => {
      const response = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers: manageHeaders })
      expect(response.statusCode).toBe(403)
    })

    it('hashes the issued secret through app.secretHasher (ADR 0102/Story 008 -- credentialSalt sourced from signet, not a hardcoded/env default), not some separate hashing path', async () => {
      const headers = await t.headers({ permissions: ['applications:manage'] })
      const issued = await t.app.inject({ method: 'POST', url: '/tenants/acme/applications/demo-app/usage-credentials', headers })
      const { credentialId, secret } = issued.json()

      const instance = await t.consequent.fetch('usageReportingCredential', credentialId)
      const state = instance!.state as unknown as { hashedSecret: string }

      // Recomputing via the exact same app.secretHasher this test app was
      // built with (spec/lib/test-app.ts's createSecretHasher('test-credential-salt'))
      // proves the route actually threads app.secretHasher through, not an
      // independent/default hasher that happens to agree.
      expect(state.hashedSecret).toBe(t.app.secretHasher.hashSecret(secret))
      expect(t.app.secretHasher.verifySecret(secret, state.hashedSecret)).toBe(true)
    })
  })
})
