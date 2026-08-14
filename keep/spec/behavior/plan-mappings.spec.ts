import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: the public HTTP contract for
// design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md's
// "Plan Mappings" section -- request/response shapes, status codes, and the
// specific rules (grantedRoles validation against the reference cache,
// Stripe pricing resolved server-side and never client-supplied,
// DELETE-is-retire, retired mappings excluded from the default list).

describe('plan mappings -- API contract', () => {
  let t: TestApp
  let headers: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    headers = await t.headers({ permissions: ['billing:manage'] })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    t.stripeState.prices.set('price_yearly', { unitAmount: 10000, currency: 'usd', interval: 'year' })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/plan-mappings', () => {
    it('creates a mapping, resolving pricing fields from Stripe rather than accepting them in the body', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.unitAmount).toBe(1000)
      expect(body.currency).toBe('usd')
      expect(body.interval).toBe('month')
      expect(body.status).toBe('active')
      expect(body.id).toBeTruthy()
    })

    it('rejects a grantedRoles entry referencing an unknown application/role (400), not silently accepted', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'nonexistent-role' }] },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects a stripePriceId that cannot be resolved against the tenant\'s Stripe account', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_does_not_exist', name: 'Ghost' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects unknown body fields at the schema level', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', unitAmount: 9999 },
      })

      // unitAmount is deliberately absent from the create schema -- Stripe
      // is authoritative, never accepted as untrusted client input.
      expect(response.statusCode).toBe(400)
    })

    it('rejects when the tenant has no stripe configuration', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/unconfigured/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })

      expect(response.statusCode).toBe(409)
    })
  })

  describe('GET /tenants/:tenantSlug/plan-mappings', () => {
    async function createMapping(name: string) {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name },
      })
      return response.json()
    }

    it('defaults to active-only, excluding retired mappings', async () => {
      const active = await createMapping('Active Plan')
      const retired = await createMapping('Retired Plan')
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${retired.id}`, headers })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers })
      const body = response.json()

      expect(body.map((m: { id: string }) => m.id)).toEqual([active.id])
    })

    it('includes retired mappings when status=all is passed', async () => {
      const active = await createMapping('Active Plan')
      const retired = await createMapping('Retired Plan')
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${retired.id}`, headers })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings?status=all', headers })
      const ids = response.json().map((m: { id: string }) => m.id).sort()

      expect(ids).toEqual([active.id, retired.id].sort())
    })

    it('scopes results to the requesting tenant only', async () => {
      await createMapping('Acme Plan')
      await t.app.inject({
        method: 'POST',
        url: '/tenants/other/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Other Plan' },
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers })
      expect(response.json()).toHaveLength(1)
    })
  })

  describe('GET /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('returns 404 for an id that was never created', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings/nonexistent', headers })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when the mapping belongs to a different tenant (cross-tenant is 404, not 403)', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({ method: 'GET', url: `/tenants/other/plan-mappings/${id}`, headers })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('updates name/seatLimit/grantedRoles/meter', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { name: 'Basic Plus', seatLimit: 10, meter: 'api-calls' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBe('Basic Plus')
      expect(body.seatLimit).toBe(10)
      expect(body.meter).toBe('api-calls')
    })

    it('applies the same grantedRoles validation as create', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { grantedRoles: [{ application: 'unknown-app', role: 'member' }] },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('DELETE /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('is an alias for PATCH { status: "retired" }', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('retired')
    })

    it('rejects retiring an already-retired mapping (409, not a silent no-op)', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })
      expect(response.statusCode).toBe(409)
    })
  })
})
