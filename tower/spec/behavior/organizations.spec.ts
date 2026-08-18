import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

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

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey, provisioningConfig })
  })

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
    it('removing one of several co-managers is a plain removal, no succession', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await consequent.handle('acct-2', 'account.join-organization', { organizationId })
      await consequent.handle(organizationId, 'organization.add-manager', { accountId: 'acct-2' })

      const headers = bearer(await jwt.signToken({ accountId: 'acct-1', organizationId, permissions: ['organization:manage'] }))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/managers/acct-2`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().managers).toEqual(['acct-1'])
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
})
