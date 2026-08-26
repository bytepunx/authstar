import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'
import { createSpyPublisher } from '../lib/fakes.js'
import type { AccountState } from '../../src/actors/account_actor.js'

// Behavior tier: design/decisions/0090-organizations-shared-billing-
// administration-and-succession.md. No `POST /accounts` route exists in
// this repo (Story 005), so tests create accounts directly via
// `consequent.handle()`, same convention accounts.spec.ts already uses.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'dex', clientId: 'client-1', discoveryUrl: 'https://dex.example/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'provider-secret-value',
}

function operatorHeaders(actor = 'ops@bytepunx.com') {
  return { authorization: `Bearer ${provisioningConfig.operatorToken}`, 'x-operator-actor': actor }
}

describe('organizations -- API contract (ADR 0090)', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let publisher: ReturnType<typeof createSpyPublisher>

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    publisher = createSpyPublisher()
    app = await buildApp({ consequent, publisher, authstarGetKey: jwt.getKey, provisioningConfig })
  })

  async function accountPermissions(accountId: string) {
    const instance = await consequent.fetch('account', accountId)
    return (instance!.state as unknown as AccountState).permissions
  }

  afterEach(async () => {
    await app.close()
  })

  async function createAccount(accountId: string, tenant = 'acme') {
    await consequent.handle(accountId, 'account.create', { accountId, tenant, contactId: `${accountId}-contact` })
  }

  async function createOrgWithManager(managerAccountId: string, tenant = 'acme'): Promise<string> {
    await createAccount(managerAccountId, tenant)
    const headers = bearer(await jwt.signToken({ accountId: managerAccountId, tenant }))
    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/organizations`,
      headers,
      payload: { name: 'Acme Corp' },
    })
    return response.json().organizationId
  }

  describe('POST /tenants/:tenantSlug/organizations', () => {
    it('creates an organization and makes the caller its first manager', async () => {
      await createAccount('acct-1')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1' }))

      const response = await app.inject({ method: 'POST', url: '/tenants/acme/organizations', headers, payload: { name: 'Acme Corp' } })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('Acme Corp')
      expect(body.managers).toEqual(['acct-1'])

      const account = await consequent.fetch('account', 'acct-1')
      expect((account!.state as { organizationId: string | null }).organizationId).toBe(body.organizationId)

      // ADR 0098: membership in managers[] alone used to be a dead end -- the
      // creator must actually receive the organization:manage grant too, or
      // requireOrganizationManager() could never pass for their own org.
      expect(await accountPermissions('acct-1')).toContainEqual({ grant: 'organization:manage', scope: 'organization', maxOutstanding: null })
      expect(publisher.calls).toContainEqual({ routingKey: 'organization.manager-added', payload: { organizationId: body.organizationId, tenant: 'acme', accountId: 'acct-1' } })
    })

    it('rejects 409 when the caller already belongs to an organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId }))
      const response = await app.inject({ method: 'POST', url: '/tenants/acme/organizations', headers, payload: { name: 'Second Org' } })
      expect(response.statusCode).toBe(409)
    })

    it('rejects 403 with no bearer token', async () => {
      const response = await app.inject({ method: 'POST', url: '/tenants/acme/organizations', payload: { name: 'Acme Corp' } })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/organizations (list)', () => {
    it('lists every organization in a tenant for a tenant admin', async () => {
      await createOrgWithManager('acct-1')
      await createOrgWithManager('acct-2')
      const adminHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/organizations', headers: adminHeaders })
      expect(response.statusCode).toBe(200)
      expect((response.json() as Array<{ name: string }>)).toHaveLength(2)
    })

    it('rejects 403 for a caller without accounts:manage, even an org manager', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/organizations', headers })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/organizations/:organizationId (read)', () => {
    it('any member (not just a manager) can view their own organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-2', organizationId }))
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().managers).toEqual(['acct-1'])
    })

    it('a tenant admin can view any organization, even without membership', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const adminHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers: adminHeaders })
      expect(response.statusCode).toBe(200)
    })

    it('rejects 403 for a caller who is neither a member nor a tenant admin', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const otherOrgId = await createOrgWithManager('acct-x')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-x', organizationId: otherOrgId }))

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 403 with no bearer token at all -- confirms this route is no longer wide open', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}` })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('POST /tenants/:tenantSlug/organizations/:organizationId/managers (add-manager)', () => {
    it('an org manager can promote an existing member to co-manager', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/managers`,
        headers,
        payload: { accountId: 'acct-2' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().managers).toEqual(['acct-1', 'acct-2'])
      // ADR 0098
      expect(await accountPermissions('acct-2')).toContainEqual({ grant: 'organization:manage', scope: 'organization', maxOutstanding: null })
      expect(publisher.calls).toContainEqual({ routingKey: 'organization.manager-added', payload: { organizationId, tenant: 'acme', accountId: 'acct-2' } })
    })

    it('rejects 409 promoting an account that is not a member of this organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/managers`,
        headers,
        payload: { accountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects 403 for a caller who is a member but lacks organization:manage', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-2', organizationId }))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/managers`,
        headers,
        payload: { accountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 403 for an organization:manage holder acting on a *different* organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const otherOrgId = await createOrgWithManager('acct-x')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-x', organizationId: otherOrgId, permissions: ['organization:manage'] }))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/managers`,
        headers,
        payload: { accountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE .../managers/:accountId (remove-manager)', () => {
    it('removing one of several co-managers is a plain removal, no succession, and revokes their grants', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.add-manager', { accountId: 'acct-2' })
      await consequent.handle('acct-2', 'account.grant-permission', { permission: { grant: 'organization:manage', scope: 'organization', maxOutstanding: null } })
      await consequent.handle('acct-2', 'account.grant-permission', { permission: { grant: 'organization-billing:manage', scope: 'organization', maxOutstanding: null } })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-2`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().managers).toEqual(['acct-1'])
      // ADR 0098: both grants revoked on removal, not just organization:manage.
      expect(await accountPermissions('acct-2')).toEqual([])
      expect(publisher.calls).toContainEqual({ routingKey: 'organization.manager-removed', payload: { organizationId, tenant: 'acme', accountId: 'acct-2' } })
    })

    it('rejects 409 removing the only remaining manager with no successor designated', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-1`, headers })
      expect(response.statusCode).toBe(409)
    })

    it('auto-promotes the designated successor when the sole manager departs', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.set-successor', { accountId: 'acct-1', successorAccountId: 'acct-2' })

      // Voluntary departure -- self, no organization:manage held at all.
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-1`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().managers).toEqual(['acct-2'])
      // ADR 0098: the promoted successor gains organization:manage; the
      // departing (self-removed) manager loses whatever they held.
      expect(await accountPermissions('acct-2')).toContainEqual({ grant: 'organization:manage', scope: 'organization', maxOutstanding: null })
      expect(await accountPermissions('acct-1')).toEqual([])
      expect(publisher.calls).toContainEqual({ routingKey: 'organization.manager-succeeded', payload: { organizationId, tenant: 'acme', departingAccountId: 'acct-1', successorAccountId: 'acct-2' } })
    })

    it('a co-manager (not self) can remove a peer manager', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.add-manager', { accountId: 'acct-2' })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-2`, headers })
      expect(response.statusCode).toBe(200)
    })

    it('rejects 403 for a plain member with no organization:manage acting on someone else', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-2', organizationId }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-1`, headers })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE .../members/:accountId (remove-member)', () => {
    it('detaches a plain member from the organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2`, headers })

      expect(response.statusCode).toBe(204)
      const account = await consequent.fetch('account', 'acct-2')
      expect((account!.state as { organizationId: string | null }).organizationId).toBeNull()
    })

    it('removing a manager as a member cascades through the same last-manager guard', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1`, headers })
      expect(response.statusCode).toBe(409)

      const account = await consequent.fetch('account', 'acct-1')
      expect((account!.state as { organizationId: string | null }).organizationId).toBe(organizationId)
    })
  })

  describe('successor designation -- strictly self-only', () => {
    it('a manager can set their own successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId }))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/managers/acct-1/successor`,
        headers,
        payload: { successorAccountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().successors).toEqual({ 'acct-1': 'acct-2' })
    })

    it('rejects 409 designating a successor who is not an org member', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId }))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/managers/acct-1/successor`,
        headers,
        payload: { successorAccountId: 'not-a-member' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects 403 even for a holder of organization:manage acting on a peer manager\'s successor -- self-only, no override', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.add-manager', { accountId: 'acct-2' })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/managers/acct-2/successor`,
        headers,
        payload: { successorAccountId: 'acct-1' },
      })
      expect(response.statusCode).toBe(403)
    })

    it('clears a previously-set successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.set-successor', { accountId: 'acct-1', successorAccountId: 'acct-2' })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-1/successor`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().successors).toEqual({})
    })
  })

  describe('POST /operator/.../managers/:accountId/promote-successor -- operator-mediated, no tenant-scoped equivalent', () => {
    it('promotes the pre-designated successor with no body argument identifying who', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await createAccount('acct-3')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle('acct-3', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.add-manager', { accountId: 'acct-2' })
      await consequent.handle(organizationId, 'organization.set-successor', { accountId: 'acct-2', successorAccountId: 'acct-3' })

      // Works on acct-2 even though acct-1 (not acct-2) remains a manager --
      // incapacitation targets a specific person, not "the sole manager."
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/managers/acct-2/promote-successor`,
        headers: operatorHeaders(),
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().managers.sort()).toEqual(['acct-1', 'acct-3'].sort())
    })

    it('rejects 403 without the operator bearer token', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/managers/acct-1/promote-successor`,
      })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 409 when the manager being succeeded has no designated successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/managers/acct-1/promote-successor`,
        headers: operatorHeaders(),
      })
      expect(response.statusCode).toBe(409)
    })

    it('has no tenant-scoped counterpart at all -- not even an org manager can reach it', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/managers/acct-1/promote-successor`,
        headers,
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('account deletion detaches organization membership (ADR 0090)', () => {
    it('a deleted plain member is detached from the organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const opsHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-2', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      const account = await consequent.fetch('account', 'acct-2')
      expect((account!.state as { organizationId: string | null }).organizationId).toBeNull()
    })

    it('deleting the sole manager with a designated successor auto-promotes it', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.set-successor', { accountId: 'acct-1', successorAccountId: 'acct-2' })

      const opsHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      const org = await consequent.fetch('organization', organizationId)
      expect((org!.state as { managers: string[] }).managers).toEqual(['acct-2'])
    })

    it('deleting the sole manager with no successor still succeeds, leaving the organization manager-less', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const opsHeaders = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      const org = await consequent.fetch('organization', organizationId)
      expect((org!.state as { managers: string[] }).managers).toEqual([])
      const account = await consequent.fetch('account', 'acct-1')
      expect((account!.state as { organizationId: string | null }).organizationId).toBeNull()
    })
  })

  describe('POST/DELETE .../members/:accountId/billing-access (ADR 0098 delegation route)', () => {
    it('a manager can grant organization-billing:manage to a plain member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'POST', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/billing-access`, headers })

      expect(response.statusCode).toBe(204)
      expect(await accountPermissions('acct-2')).toContainEqual({ grant: 'organization-billing:manage', scope: 'organization', maxOutstanding: null })
    })

    it('a manager can revoke organization-billing:manage from a member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle('acct-2', 'account.grant-permission', { permission: { grant: 'organization-billing:manage', scope: 'organization', maxOutstanding: null } })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/billing-access`, headers })

      expect(response.statusCode).toBe(204)
      expect(await accountPermissions('acct-2')).toEqual([])
    })

    it('rejects 403 for a plain member with no organization:manage', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await createAccount('acct-3')
      await consequent.handle('acct-3', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-2', organizationId }))
      const response = await app.inject({ method: 'POST', url: `/tenants/acme/organizations/${organizationId}/members/acct-3/billing-access`, headers })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 404 for a target account that is not a member of this organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'POST', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/billing-access`, headers })
      expect(response.statusCode).toBe(404)
    })

    it('a tenant admin (accounts:manage) can also grant it, same as every other org-manager-gated route', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })

      const headers = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'POST', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/billing-access`, headers })
      expect(response.statusCode).toBe(204)
    })
  })
})
