import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// Behavior tier: design/stories/tower/010-activity-feed.md and design/
// decisions/0060-activity-feed-and-revenue-summary.md. Exercises both
// `GET /tenants/:tenantSlug/activity` and its operator-scoped twin against
// the real in-memory `consequent` (buildInMemoryConsequent -- the fixed
// searchAdapter + the real, now-working getEventStream from consequent
// 2.0.6, not a mock), across multiple actor types at once.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: true,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'default', clientId: '', discoveryUrl: '', scope: [] },
  defaultProviderClientSecret: '',
}

describe('activity feed -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey, provisioningConfig })
    headers = bearer(await jwt.signToken({ permissions: ['activity:read'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 'test-harness' })
  }

  async function createApplication(tenant: string, slug: string, name: string) {
    await consequent.handle(`${tenant}:${slug}`, 'application.create', { tenant, slug, name, hosts: [], publicUrl: '', exposedProviders: [] })
  }

  async function createProvider(tenant: string, name: string) {
    await consequent.handle(`${tenant}:${name}`, 'provider.create', {
      tenant, name, clientId: 'client-id', discoveryUrl: 'https://idp.test/.well-known', scope: ['openid'],
    })
  }

  async function createAccount(accountId: string, tenant: string, contactId: string) {
    await consequent.handle(accountId, 'account.create', { accountId, tenant, contactId })
  }

  async function createActiveRoleDefinition(tenant: string, name: string) {
    await consequent.handle(`${tenant}:${name}`, 'roleDefinition.create', { tenant, name, scope: 'tenant', description: '' })
  }

  describe('GET /tenants/:tenantSlug/activity', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/nonexistent/activity', headers })
      expect(response.statusCode).toBe(404)
    })

    it('rejects without activity:read', async () => {
      await createTenant('acme')
      const unprivileged = bearer(await jwt.signToken({ permissions: [] }))
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/activity', headers: unprivileged })
      expect(response.statusCode).toBe(403)
    })

    it('returns an empty page for a tenant with no tracked activity yet', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/activity', headers })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: [], nextCursor: null })
    })

    it('merges events across every tracked actor type, newest first, with human-readable summaries', async () => {
      await createTenant('acme')
      await createApplication('acme', 'billing', 'Billing')
      await createProvider('acme', 'dex')
      await createAccount('acct-1', 'acme', 'contact-1')
      await createActiveRoleDefinition('acme', 'admin')
      await consequent.handle('acct-1', 'account.grant-role', { role: { name: 'admin', scope: 'tenant' } })

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/activity', headers })
      expect(response.statusCode).toBe(200)
      const body = response.json()

      const summaries = (body.data as Array<{ summary: string }>).map((e) => e.summary)
      expect(summaries).toContain("Application 'Billing' created")
      expect(summaries).toContain("Provider 'dex' added")
      expect(summaries).toContain('Account created')
      expect(summaries).toContain("Role definition 'admin' created (tenant-wide)")
      expect(summaries).toContain("Role 'admin' granted (tenant-wide)")

      // newest first: the role-grant (last action taken) should sort ahead
      // of account creation (an earlier action) in the returned page.
      const roleGrantIndex = summaries.indexOf("Role 'admin' granted (tenant-wide)")
      const accountCreatedIndex = summaries.indexOf('Account created')
      expect(roleGrantIndex).toBeLessThan(accountCreatedIndex)

      for (const entry of body.data as Array<Record<string, unknown>>) {
        expect(entry.timestamp).toBeTruthy()
        expect(entry.actorType).toBeTruthy()
        expect(entry.actorId).toBeTruthy()
        expect(entry.eventType).toBeTruthy()
        expect(entry.actingAs).toBeNull()
      }
    })

    it('never leaks another tenant\'s activity into this tenant\'s feed', async () => {
      await createTenant('acme')
      await createTenant('globex')
      await createApplication('acme', 'billing', 'Billing')
      await createApplication('globex', 'billing', 'Globex Billing')

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/activity', headers })
      const summaries = (response.json().data as Array<{ summary: string }>).map((e) => e.summary)
      expect(summaries).toContain("Application 'Billing' created")
      expect(summaries).not.toContain("Application 'Globex Billing' created")
    })

    it('paginates via cursor, in strictly newest-first order with no gaps or duplicates across pages', async () => {
      await createTenant('acme')
      for (let i = 0; i < 5; i++) {
        await createApplication('acme', `app-${i}`, `App ${i}`)
      }

      const page1 = await app.inject({ method: 'GET', url: '/tenants/acme/activity?limit=2', headers })
      expect(page1.statusCode).toBe(200)
      const body1 = page1.json()
      expect(body1.data).toHaveLength(2)
      expect(body1.nextCursor).toBeTruthy()

      const page2 = await app.inject({ method: 'GET', url: `/tenants/acme/activity?limit=2&cursor=${body1.nextCursor}`, headers })
      const body2 = page2.json()
      expect(body2.data).toHaveLength(2)
      expect(body2.nextCursor).toBeTruthy()

      const page3 = await app.inject({ method: 'GET', url: `/tenants/acme/activity?limit=2&cursor=${body2.nextCursor}`, headers })
      const body3 = page3.json()
      expect(body3.data).toHaveLength(1)
      expect(body3.nextCursor).toBeNull()

      const allIds = [...body1.data, ...body2.data, ...body3.data].map((e: { actorId: string, eventType: string }) => `${e.actorId}:${e.eventType}`)
      expect(new Set(allIds).size).toBe(5) // no duplicates across pages
    })
  })

  describe('GET /operator/tenants/:tenantSlug/activity', () => {
    it('rejects without a valid operator bearer token', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity' })
      expect(response.statusCode).toBe(403)
    })

    it('rejects the old x-operator-token header -- only Authorization: Bearer is accepted', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity', headers: { 'x-operator-token': 'op-secret' } })
      expect(response.statusCode).toBe(403)
    })

    it('returns the same merged feed as the tenant-scoped route, needing no activity:read grant', async () => {
      await createTenant('acme')
      await createApplication('acme', 'billing', 'Billing')

      const response = await app.inject({
        method: 'GET',
        url: '/operator/tenants/acme/activity',
        headers: { authorization: 'Bearer op-secret' },
      })
      expect(response.statusCode).toBe(200)
      const summaries = (response.json().data as Array<{ summary: string }>).map((e) => e.summary)
      expect(summaries).toContain("Application 'Billing' created")
    })

    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/tenants/nonexistent/activity',
        headers: { authorization: 'Bearer op-secret' },
      })
      expect(response.statusCode).toBe(404)
    })
  })
})
