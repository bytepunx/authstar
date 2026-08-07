import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/004-trials-and-coupons.md ("Coupons").

describe('coupons -- API contract', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/coupons', () => {
    it('creates a coupon keyed internally by {tenantSlug}:{code}, never exposing the composite key', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/coupons',
        payload: { code: 'LAUNCH50', grantedRoles: [{ application: 'demo-app', role: 'member' }], trialDurationDays: 14 },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.code).toBe('LAUNCH50')
      expect(body.status).toBe('active')
      expect(body.redemptionCount).toBe(0)
      expect(body.key).toBeUndefined()
    })

    it('the same code may be reused across different tenants', async () => {
      const first = await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'LAUNCH50' } })
      const second = await t.app.inject({ method: 'POST', url: '/tenants/other/coupons', payload: { code: 'LAUNCH50' } })

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(201)
    })

    it('rejects a duplicate code within the same tenant, regardless of the existing coupon\'s status', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DUP' } })

      const response = await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DUP' } })
      expect(response.statusCode).toBe(409)
    })

    it('rejects an unknown grantedRoles entry', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/coupons',
        payload: { code: 'BADROLE', grantedRoles: [{ application: 'ghost-app', role: 'member' }] },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /tenants/:tenantSlug/coupons/:code', () => {
    it('resolves the bare code, 404 for an unknown one', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'FOUND' } })

      const found = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons/FOUND' })
      expect(found.statusCode).toBe(200)
      expect(found.json().code).toBe('FOUND')

      const missing = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons/NOTFOUND' })
      expect(missing.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/coupons/:code', () => {
    it('revokes the coupon', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'REVOKEME' } })

      const response = await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/REVOKEME', payload: { status: 'revoked' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects revoking an already-revoked coupon', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DOUBLEREVOKE' } })
      await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/DOUBLEREVOKE', payload: { status: 'revoked' } })

      const response = await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/DOUBLEREVOKE', payload: { status: 'revoked' } })
      expect(response.statusCode).toBe(409)
    })
  })

  describe('DELETE /tenants/:tenantSlug/coupons/:code', () => {
    it('is an alias for PATCH { status: "revoked" }', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DELETEME' } })

      const response = await t.app.inject({ method: 'DELETE', url: '/tenants/acme/coupons/DELETEME' })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })
  })

  describe('GET /tenants/:tenantSlug/coupons', () => {
    it('lists coupons for the tenant only', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'A' } })
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'B' } })
      await t.app.inject({ method: 'POST', url: '/tenants/other/coupons', payload: { code: 'C' } })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons' })
      expect(response.json()).toHaveLength(2)
    })
  })
})
