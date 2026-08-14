import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/004-trials-and-coupons.md ("Coupons").

describe('coupons -- API contract', () => {
  let t: TestApp
  let headers: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    headers = await t.headers({ permissions: ['billing:manage'] })
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/coupons', () => {
    it('creates a coupon keyed internally by {tenantSlug}:{code}, never exposing the composite key', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/coupons',
        headers,
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
      const first = await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'LAUNCH50' }, headers })
      const second = await t.app.inject({ method: 'POST', url: '/tenants/other/coupons', payload: { code: 'LAUNCH50' }, headers })

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(201)
    })

    it('rejects a duplicate code within the same tenant, regardless of the existing coupon\'s status', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DUP' }, headers })

      const response = await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DUP' }, headers })
      expect(response.statusCode).toBe(409)
    })

    it('rejects an unknown grantedRoles entry', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/coupons',
        headers,
        payload: { code: 'BADROLE', grantedRoles: [{ application: 'ghost-app', role: 'member' }] },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /tenants/:tenantSlug/coupons/:code', () => {
    it('resolves the bare code, 404 for an unknown one', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'FOUND' }, headers })

      const found = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons/FOUND', headers })
      expect(found.statusCode).toBe(200)
      expect(found.json().code).toBe('FOUND')

      const missing = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons/NOTFOUND', headers })
      expect(missing.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/coupons/:code', () => {
    it('revokes the coupon', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'REVOKEME' }, headers })

      const response = await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/REVOKEME', payload: { status: 'revoked' }, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects revoking an already-revoked coupon', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DOUBLEREVOKE' }, headers })
      await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/DOUBLEREVOKE', payload: { status: 'revoked' }, headers })

      const response = await t.app.inject({ method: 'PATCH', url: '/tenants/acme/coupons/DOUBLEREVOKE', payload: { status: 'revoked' }, headers })
      expect(response.statusCode).toBe(409)
    })
  })

  describe('DELETE /tenants/:tenantSlug/coupons/:code', () => {
    it('is an alias for PATCH { status: "revoked" }', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'DELETEME' }, headers })

      const response = await t.app.inject({ method: 'DELETE', url: '/tenants/acme/coupons/DELETEME', headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })
  })

  describe('GET /tenants/:tenantSlug/coupons', () => {
    it('lists coupons for the tenant only', async () => {
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'A' }, headers })
      await t.app.inject({ method: 'POST', url: '/tenants/acme/coupons', payload: { code: 'B' }, headers })
      await t.app.inject({ method: 'POST', url: '/tenants/other/coupons', payload: { code: 'C' }, headers })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/coupons', headers })
      expect(response.json()).toHaveLength(2)
    })
  })
})
