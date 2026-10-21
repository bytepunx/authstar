import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: design/adrs/0101-api-keys.md's personal + org route
// trees (`routes/api-keys.ts`). `requireAppRole`/the org manager+role gate
// both do a *live* fetch against the owner's current `grantedRoles` rather
// than trusting anything from the token's own `roles` claim (see
// `permissions.ts`'s own comment on why) -- every test here grants roles
// directly via `consequent.handle`, then asserts against the route's own
// live-checked behavior, not against what the token happens to carry.

describe('api-keys -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 't' })
  }

  async function createApplication(tenantSlug: string, appSlug: string) {
    await consequent.handle(`${tenantSlug}:${appSlug}`, 'application.create', { tenant: tenantSlug, slug: appSlug, name: appSlug, hosts: [], publicUrl: '', exposedProviders: [] })
  }

  async function seedAccount(accountId: string, tenantSlug: string, grantedRoles: Array<{ name: string, scope: 'tenant' | { application: string } }> = []) {
    await consequent.handle(accountId, 'account.create', { accountId, tenant: tenantSlug, contactId: `contact-${accountId}` })
    for (const role of grantedRoles) {
      await consequent.handle(accountId, 'account.grant-role', { role })
    }
  }

  async function setAccountApiKeyLimit(accountId: string, apiKeyLimit: number | null) {
    await consequent.handle(accountId, 'account.set-api-key-limit', { apiKeyLimit })
  }

  async function createOrganization(organizationId: string, tenantSlug: string, grantedRoles: Array<{ application: string, role: string }> = [], apiKeyLimit: number | null = null) {
    await consequent.handle(organizationId, 'organization.create', { organizationId, tenant: tenantSlug, name: organizationId })
    for (const role of grantedRoles) {
      await consequent.handle(organizationId, 'organization.grant-role', { role })
    }
    await consequent.handle(organizationId, 'organization.set-api-key-limit', { apiKeyLimit })
  }

  async function addOrganizationManager(organizationId: string, tenantSlug: string, accountId: string) {
    await consequent.handle(`membership-${organizationId}-${accountId}`, 'organizationMembership.create', {
      membershipId: `membership-${organizationId}-${accountId}`, tenant: tenantSlug, accountId, organizationId, roles: ['member', 'manager'],
    })
  }

  describe('POST /tenants/:tenantSlug/applications/:appSlug/api-keys (personal)', () => {
    it('rejects when the caller does not hold api-keys:manage for this application', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [])
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(403)
    })

    it('creates a key, returning the secret once, when the caller holds api-keys:manage and an unlimited apiKeyLimit', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', null)
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.secret).toMatch(/^authstar_.+_.+$/)
      expect(body.grantedRoles).toEqual(['read'])
      expect(body.owner).toEqual({ account: 'acct-1' })
      expect(body.secretPreview).toBe(body.secret.slice(-4))
    })

    it('rejects a requested role the caller does not currently hold for this application', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [{ name: 'api-keys:manage', scope: { application: 'app1' } }])
      await setAccountApiKeyLimit('acct-1', null)
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['admin'] },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects creation at the fail-closed default apiKeyLimit of 0', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      // account.created defaults apiKeyLimit to 0 -- never explicitly raised here.
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(409)
    })

    it('enforces a finite apiKeyLimit across repeated creates', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', 1)
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const first = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'key one', grantedRoles: ['read'] },
      })
      expect(first.statusCode).toBe(201)

      const second = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'key two', grantedRoles: ['read'] },
      })
      expect(second.statusCode).toBe(409)
    })
  })

  describe('GET /tenants/:tenantSlug/applications/:appSlug/api-keys (personal)', () => {
    it('never includes the secret/hashedSecret/salt', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', null)
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/applications/app1/api-keys', headers })
      expect(response.statusCode).toBe(200)
      const [key] = response.json()
      expect(key.name).toBe('ci key')
      expect(key.secret).toBeUndefined()
      expect(key.hashedSecret).toBeUndefined()
      expect(key.salt).toBeUndefined()
    })

    it('only lists the caller\'s own keys, not another account\'s', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', null)
      await seedAccount('acct-2', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-2', null)

      await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys',
        headers: bearer(await jwt.signToken({ accountId: 'acct-1' })),
        payload: { name: 'acct-1 key', grantedRoles: ['read'] },
      })
      await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys',
        headers: bearer(await jwt.signToken({ accountId: 'acct-2' })),
        payload: { name: 'acct-2 key', grantedRoles: ['read'] },
      })

      const response = await app.inject({
        method: 'GET', url: '/tenants/acme/applications/app1/api-keys',
        headers: bearer(await jwt.signToken({ accountId: 'acct-1' })),
      })
      const keys = response.json()
      expect(keys).toHaveLength(1)
      expect(keys[0].name).toBe('acct-1 key')
    })
  })

  describe('DELETE /tenants/:tenantSlug/applications/:appSlug/api-keys/:apiKeyId (personal)', () => {
    it('revokes the caller\'s own key', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', null)
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const created = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys', headers,
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })
      const { apiKeyId } = created.json()

      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/applications/app1/api-keys/${apiKeyId}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')

      const state = await consequent.fetch('apiKey', apiKeyId)
      expect((state!.state as { status: string }).status).toBe('revoked')
    })

    it('returns 404 for another account\'s key', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await seedAccount('acct-1', 'acme', [
        { name: 'api-keys:manage', scope: { application: 'app1' } },
        { name: 'read', scope: { application: 'app1' } },
      ])
      await setAccountApiKeyLimit('acct-1', null)
      await seedAccount('acct-2', 'acme', [{ name: 'api-keys:manage', scope: { application: 'app1' } }])
      await setAccountApiKeyLimit('acct-2', null)

      const created = await app.inject({
        method: 'POST', url: '/tenants/acme/applications/app1/api-keys',
        headers: bearer(await jwt.signToken({ accountId: 'acct-1' })),
        payload: { name: 'ci key', grantedRoles: ['read'] },
      })
      const { apiKeyId } = created.json()

      const response = await app.inject({
        method: 'DELETE', url: `/tenants/acme/applications/app1/api-keys/${apiKeyId}`,
        headers: bearer(await jwt.signToken({ accountId: 'acct-2' })),
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('organization-owned keys', () => {
    it('rejects when the org itself does not hold api-keys:manage even if the caller is a manager', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await createOrganization('org-1', 'acme', [{ application: 'app1', role: 'read' }], null)
      await seedAccount('acct-1', 'acme')
      await addOrganizationManager('org-1', 'acme', 'acct-1')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['member', 'manager'] }] }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/organizations/org-1/applications/app1/api-keys', headers,
        payload: { name: 'org key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(403)
    })

    it('rejects when the caller is a member but not a manager of the org', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await createOrganization('org-1', 'acme', [{ application: 'app1', role: 'api-keys:manage' }, { application: 'app1', role: 'read' }], null)
      await seedAccount('acct-1', 'acme')
      await consequent.handle('membership-org-1-acct-1', 'organizationMembership.create', {
        membershipId: 'membership-org-1-acct-1', tenant: 'acme', accountId: 'acct-1', organizationId: 'org-1', roles: ['member'],
      })
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['member'] }] }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/organizations/org-1/applications/app1/api-keys', headers,
        payload: { name: 'org key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(403)
    })

    it('lets an org manager create an org-owned key when the org holds api-keys:manage', async () => {
      await createTenant('acme')
      await createApplication('acme', 'app1')
      await createOrganization('org-1', 'acme', [{ application: 'app1', role: 'api-keys:manage' }, { application: 'app1', role: 'read' }], null)
      await seedAccount('acct-1', 'acme')
      await addOrganizationManager('org-1', 'acme', 'acct-1')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['member', 'manager'] }] }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/organizations/org-1/applications/app1/api-keys', headers,
        payload: { name: 'org key', grantedRoles: ['read'] },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.owner).toEqual({ organization: 'org-1' })
      expect(body.createdBy).toBe('acct-1')
    })
  })
})
