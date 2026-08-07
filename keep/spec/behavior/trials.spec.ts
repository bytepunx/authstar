import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/stories/keep/004-trials-and-coupons.md ("Trials").

describe('trials -- API contract', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/trials', () => {
    it('creates a trial and publishes one entitlement.trial-granted per role', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/trials',
        payload: {
          scope: { account: 'acct_1' },
          grantedRoles: [{ application: 'demo-app', role: 'member' }, { application: 'demo-app', role: 'admin' }],
          expiresAt: '2026-12-31T00:00:00.000Z',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.status).toBe('active')
      expect(body.extensions).toEqual([])

      const granted = t.publisher.published.filter((e) => e.type === 'entitlement.trial-granted')
      expect(granted).toHaveLength(2)
    })

    it('rejects an unknown grantedRoles entry', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/trials',
        payload: { scope: { account: 'acct_2' }, grantedRoles: [{ application: 'ghost-app', role: 'member' }], expiresAt: '2026-12-31T00:00:00.000Z' },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /tenants/:tenantSlug/trials', () => {
    it('filters by status', async () => {
      const active = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/trials', payload: { scope: { account: 'a1' }, expiresAt: '2026-12-31T00:00:00.000Z' },
      })).json()
      const toExpire = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/trials', payload: { scope: { account: 'a2' }, expiresAt: '2026-12-31T00:00:00.000Z' },
      })).json()
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/trials/${toExpire.id}` })

      const activeOnly = await t.app.inject({ method: 'GET', url: '/tenants/acme/trials?status=active' })
      expect(activeOnly.json().map((tr: { id: string }) => tr.id)).toEqual([active.id])

      const expiredOnly = await t.app.inject({ method: 'GET', url: '/tenants/acme/trials?status=expired' })
      expect(expiredOnly.json().map((tr: { id: string }) => tr.id)).toEqual([toExpire.id])
    })
  })

  describe('PATCH /tenants/:tenantSlug/trials/:id -- extend or reissue', () => {
    it('appends an extension entry and updates expiresAt, publishing entitlement.trial-extended', async () => {
      const created = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/trials', payload: { scope: { account: 'a3' }, expiresAt: '2026-06-01T00:00:00.000Z' },
      })).json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/trials/${created.id}`,
        payload: { expiresAt: '2026-09-01T00:00:00.000Z' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.expiresAt).toBe('2026-09-01T00:00:00.000Z')
      expect(body.extensions).toHaveLength(1)
      expect(body.extensions[0].newExpiresAt).toBe('2026-09-01T00:00:00.000Z')

      expect(t.publisher.published.some((e) => e.type === 'entitlement.trial-extended')).toBe(true)
    })

    it('extend and reissue are the same operation -- a second PATCH appends a second extension entry', async () => {
      const created = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/trials', payload: { scope: { account: 'a4' }, expiresAt: '2026-06-01T00:00:00.000Z' },
      })).json()

      await t.app.inject({ method: 'PATCH', url: `/tenants/acme/trials/${created.id}`, payload: { expiresAt: '2026-07-01T00:00:00.000Z' } })
      const second = await t.app.inject({ method: 'PATCH', url: `/tenants/acme/trials/${created.id}`, payload: { expiresAt: '2026-08-01T00:00:00.000Z' } })

      expect(second.json().extensions).toHaveLength(2)
    })
  })

  describe('DELETE /tenants/:tenantSlug/trials/:id -- revoke', () => {
    it('is an alias for PATCH { status: "expired" } and revokes every granted role', async () => {
      const created = (await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/trials',
        payload: { scope: { account: 'a5' }, grantedRoles: [{ application: 'demo-app', role: 'member' }], expiresAt: '2026-06-01T00:00:00.000Z' },
      })).json()
      t.publisher.published.length = 0

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/trials/${created.id}` })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('expired')

      const revoked = t.publisher.published.filter((e) => e.type === 'entitlement.role-revoked')
      expect(revoked).toHaveLength(1)
    })

    it('rejects revoking an already-expired trial (409, not a silent no-op)', async () => {
      const created = (await t.app.inject({
        method: 'POST', url: '/tenants/acme/trials', payload: { scope: { account: 'a6' }, expiresAt: '2026-06-01T00:00:00.000Z' },
      })).json()
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/trials/${created.id}` })

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/trials/${created.id}` })
      expect(response.statusCode).toBe(409)
    })
  })
})
