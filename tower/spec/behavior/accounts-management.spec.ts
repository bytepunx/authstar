import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for design/stories/tower/005-accounts-roles-and-permissions.md's
// list/detail/status/roles/permissions surface -- `change-email` (ADR 0076)
// stays covered in its own `accounts.spec.ts`, unchanged.

describe('accounts management -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let manageHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
    manageHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage', 'roles:manage', 'permissions:manage', 'contacts:read'], accountId: 'admin-acct' }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 't' })
  }

  async function createAccount(accountId: string, tenant: string, contactId = `contact-${accountId}`) {
    await consequent.handle(accountId, 'account.create', { accountId, tenant, contactId })
  }

  async function createActiveRoleDefinition(tenantSlug: string, name: string, scope: 'tenant' | { application: string } = 'tenant') {
    const key = scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
    await consequent.handle(key, 'roleDefinition.create', { tenant: tenantSlug, name, scope, description: '' })
  }

  describe('GET /tenants/:tenantSlug/accounts', () => {
    it('lists accounts for a tenant', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await createAccount('acct-2', 'acme')

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts', headers: manageHeaders })
      expect(response.statusCode).toBe(200)
      expect((response.json() as Array<{ accountId: string }>).map((a) => a.accountId).sort()).toEqual(['acct-1', 'acct-2'])
    })

    it('excludes contactId from every list entry', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts', headers: manageHeaders })
      expect(response.json()[0].contactId).toBeUndefined()
    })

    it('filters by status', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await createAccount('acct-2', 'acme')
      await consequent.handle('acct-2', 'account.suspend', {})

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts?status=suspended', headers: manageHeaders })
      expect((response.json() as Array<{ accountId: string }>).map((a) => a.accountId)).toEqual(['acct-2'])
    })

    it('resolves an ?email= search to the matching account via the contact HMAC, requiring contacts:read in addition to accounts:manage', async () => {
      await createTenant('acme')
      const contact = await app.contactStore.upsert('acme', 'admin@acme.test')
      await createAccount('acct-1', 'acme', contact.id)

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts?email=admin@acme.test', headers: manageHeaders })
      expect(response.statusCode).toBe(200)
      expect((response.json() as Array<{ accountId: string }>).map((a) => a.accountId)).toEqual(['acct-1'])
    })

    it('rejects an ?email= search without contacts:read, even with accounts:manage', async () => {
      await createTenant('acme')
      const noContactsRead = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts?email=admin@acme.test', headers: noContactsRead })
      expect(response.statusCode).toBe(403)
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts' })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/accounts/:accountId', () => {
    it('is self-readable with no permissions grant at all', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      const selfHeaders = bearer(await jwt.signToken({ permissions: [], accountId: 'acct-1' }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct-1', headers: selfHeaders })
      expect(response.statusCode).toBe(200)
    })

    it('is readable by another account holding accounts:manage', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct-1', headers: manageHeaders })
      expect(response.statusCode).toBe(200)
      expect(response.json().contactId).toBeUndefined()
    })

    it('rejects a different account with no grant', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      const otherHeaders = bearer(await jwt.signToken({ permissions: [], accountId: 'acct-2' }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct-1', headers: otherHeaders })
      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for a cross-tenant accountId', async () => {
      await createTenant('acme')
      await createTenant('other')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'GET', url: '/tenants/other/accounts/acct-1', headers: manageHeaders })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/accounts/:accountId', () => {
    it('suspends an active account', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: manageHeaders, payload: { status: 'suspended' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('suspended')
    })

    it('reactivates a suspended account', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.suspend', {})

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: manageHeaders, payload: { status: 'active' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('active')
    })

    it('soft-deletes an account (business status, not GDPR erasure)', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: manageHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('deleted')
    })

    it('rejects a redundant transition (already active)', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: manageHeaders, payload: { status: 'active' } })
      expect(response.statusCode).toBe(409)
    })

    it('is not self-actionable even for your own account -- accounts:manage is required regardless', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      const selfHeaders = bearer(await jwt.signToken({ permissions: [], accountId: 'acct-1' }))

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: selfHeaders, payload: { status: 'suspended' } })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('POST /tenants/:tenantSlug/accounts/:accountId/roles', () => {
    it('grants a role backed by an active role definition, always to grantedRoles (permanent)', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await createActiveRoleDefinition('acme', 'admin')

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/roles', headers: manageHeaders,
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().grantedRoles).toEqual([{ name: 'admin', scope: 'tenant' }])
      expect(response.json().trialRoles).toEqual([])
    })

    it('rejects a role not backed by an active role definition', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/roles', headers: manageHeaders,
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('requires roles:manage even when granting a role to yourself', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await createActiveRoleDefinition('acme', 'admin')
      const selfHeaders = bearer(await jwt.signToken({ permissions: [], accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/roles', headers: selfHeaders,
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE /tenants/:tenantSlug/accounts/:accountId/roles/:name', () => {
    it('revokes a tenant-scoped role', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.grant-role', { role: { name: 'admin', scope: 'tenant' } })

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/accounts/acct-1/roles/admin?scope=tenant', headers: manageHeaders })
      expect(response.statusCode).toBe(200)
      expect(response.json().grantedRoles).toEqual([])
    })

    it('disambiguates an application-scoped role via ?applicationScope, leaving the tenant-scoped one with the same name intact', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.grant-role', { role: { name: 'viewer', scope: 'tenant' } })
      await consequent.handle('acct-1', 'account.grant-role', { role: { name: 'viewer', scope: { application: 'billing' } } })

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/accounts/acct-1/roles/viewer?applicationScope=billing', headers: manageHeaders })
      expect(response.json().grantedRoles).toEqual([{ name: 'viewer', scope: 'tenant' }])
    })

    it('also removes a matching trialRoles entry', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.grant-trial-role', { role: { name: 'pro', scope: 'tenant' }, trialExpiresAt: '2030-01-01T00:00:00.000Z' })

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/accounts/acct-1/roles/pro?scope=tenant', headers: manageHeaders })
      expect(response.json().trialRoles).toEqual([])
    })
  })

  describe('POST /tenants/:tenantSlug/accounts/:accountId/permissions', () => {
    it('grants a catalogued permission', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/permissions', headers: manageHeaders,
        payload: { grant: 'billing:manage', scope: 'tenant', maxOutstanding: null },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().permissions).toEqual([{ grant: 'billing:manage', scope: 'tenant', maxOutstanding: null }])
    })

    it('rejects an uncatalogued grant string outright', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/permissions', headers: manageHeaders,
        payload: { grant: 'not-a-real-grant', scope: 'tenant', maxOutstanding: null },
      })
      expect(response.statusCode).toBe(400)
    })

    it('allows the same grant string at two different scopes simultaneously', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')

      await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/permissions', headers: manageHeaders,
        payload: { grant: 'invite:send', scope: 'tenant', maxOutstanding: null },
      })
      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/permissions', headers: manageHeaders,
        payload: { grant: 'invite:send', scope: { application: 'billing' }, maxOutstanding: null },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().permissions).toEqual([
        { grant: 'invite:send', scope: 'tenant', maxOutstanding: null },
        { grant: 'invite:send', scope: { application: 'billing' }, maxOutstanding: null },
      ])
    })

    it('requires permissions:manage even when granting to yourself -- the single most important self-action exception in this design', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      const selfHeaders = bearer(await jwt.signToken({ permissions: [], accountId: 'acct-1' }))

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/accounts/acct-1/permissions', headers: selfHeaders,
        payload: { grant: 'permissions:manage', scope: 'tenant', maxOutstanding: null },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE /tenants/:tenantSlug/accounts/:accountId/permissions/:grant', () => {
    it('revokes a tenant-scoped permission', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.grant-permission', { permission: { grant: 'billing:manage', scope: 'tenant', maxOutstanding: null } })

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/accounts/acct-1/permissions/billing:manage?scope=tenant', headers: manageHeaders })
      expect(response.statusCode).toBe(200)
      expect(response.json().permissions).toEqual([])
    })

    it('disambiguates by scope, leaving the other-scoped grant of the same name intact', async () => {
      await createTenant('acme')
      await createAccount('acct-1', 'acme')
      await consequent.handle('acct-1', 'account.grant-permission', { permission: { grant: 'invite:send', scope: 'tenant', maxOutstanding: null } })
      await consequent.handle('acct-1', 'account.grant-permission', { permission: { grant: 'invite:send', scope: { application: 'billing' }, maxOutstanding: null } })

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/accounts/acct-1/permissions/invite:send?applicationScope=billing', headers: manageHeaders })
      expect(response.json().permissions).toEqual([{ grant: 'invite:send', scope: 'tenant', maxOutstanding: null }])
    })
  })
})
