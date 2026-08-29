import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { searchCriteria } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { roleDefinitionKey } from '../../src/lib/role-definition-lookup.js'
import type { OrganizationMembershipState } from '../../src/actors/organization_membership_actor.js'

// Behavior tier: design/decisions/0100-organization-membership-and-open-
// role-catalog.md (supersedes ADR 0090/0098). No `POST /accounts` route
// exists in this repo (Story 005), so tests create accounts directly via
// `consequent.handle()`, same convention accounts.spec.ts already uses.
// Membership records are likewise seeded directly for test setup that
// doesn't itself exercise the route under test.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'dex', clientId: 'client-1', discoveryUrl: 'https://dex.example/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'provider-secret-value',
}

const DEFAULT_ORGANIZATION_ROLES = ['manager', 'member', 'billingAdmin', 'billingViewer']

function operatorHeaders(actor = 'ops@bytepunx.com') {
  return { authorization: `Bearer ${provisioningConfig.operatorToken}`, 'x-operator-actor': actor }
}

describe('organizations -- API contract (ADR 0100)', () => {
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

  afterEach(async () => {
    await app.close()
  })

  async function createAccount(accountId: string, tenant = 'acme') {
    await consequent.handle(accountId, 'account.create', { accountId, tenant, contactId: `${accountId}-contact` })
  }

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 't' })
  }

  // Mirrors provisioning.ts's own DEFAULT_ORGANIZATION_ROLES seeding step
  // without going through the full `/tenants` provisioning route (which
  // needs a real signetAdmin/herald key this file has no use for) -- same
  // narrower-setup-helper convention role-definitions.spec.ts already
  // uses for role-definition-dependent tests elsewhere in this repo.
  async function seedOrganizationRoles(tenant = 'acme') {
    for (const name of DEFAULT_ORGANIZATION_ROLES) {
      const key = roleDefinitionKey(tenant, name, 'organization')
      await consequent.handle(key, 'roleDefinition.create', { tenant, name, scope: 'organization', description: name })
    }
  }

  function tokenFor(accountId: string, memberships: Array<{ organizationId: string, roles: string[] }> = [], extra: Record<string, unknown> = {}) {
    return jwt.signToken({ accountId, organizationMemberships: memberships, ...extra })
  }

  async function membershipFor(accountId: string, organizationId: string, tenant = 'acme'): Promise<OrganizationMembershipState | undefined> {
    const instances = await consequent.find('organizationMembership', searchCriteria({ tenant, accountId, organizationId }))
    return instances[0]?.state as unknown as OrganizationMembershipState | undefined
  }

  // Direct membership seeding for test setup that isn't itself exercising
  // the route under test -- mirrors the old suite's `account.join-
  // organization` setup calls, now against the membership actor.
  async function seedMembership(accountId: string, organizationId: string, roles: string[], tenant = 'acme'): Promise<string> {
    const id = `${tenant}:${organizationId}:${accountId}`
    await consequent.handle(id, 'organizationMembership.create', { membershipId: id, tenant, accountId, organizationId, roles })
    return id
  }

  async function setSeatLimit(organizationId: string, seatLimit: number | null) {
    await consequent.handle(organizationId, 'organization.set-seat-limit', { seatLimit })
  }

  async function createOrgWithManager(managerAccountId: string, tenant = 'acme'): Promise<string> {
    await createTenant(tenant)
    await seedOrganizationRoles(tenant)
    await createAccount(managerAccountId, tenant)
    const headers = bearer(await tokenFor(managerAccountId, [], { tenant }))
    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/organizations`,
      headers,
      payload: { name: 'Acme Corp' },
    })
    return response.json().organizationId
  }

  describe('POST /tenants/:tenantSlug/organizations', () => {
    it('creates an organization and makes the caller its manager', async () => {
      await createAccount('acct-1')
      const headers = bearer(await tokenFor('acct-1'))

      const response = await app.inject({ method: 'POST', url: '/tenants/acme/organizations', headers, payload: { name: 'Acme Corp' } })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('Acme Corp')

      const membership = await membershipFor('acct-1', body.organizationId)
      expect(membership?.roles.sort()).toEqual(['manager', 'member'])
    })

    it('lets a caller create a second organization while already belonging to one -- multi-org membership (ADR 0100)', async () => {
      const firstOrgId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId: firstOrgId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'POST', url: '/tenants/acme/organizations', headers, payload: { name: 'Second Org' } })
      expect(response.statusCode).toBe(201)

      const secondOrgId = response.json().organizationId
      expect(secondOrgId).not.toBe(firstOrgId)
      expect((await membershipFor('acct-1', firstOrgId))?.roles.sort()).toEqual(['manager', 'member'])
      expect((await membershipFor('acct-1', secondOrgId))?.roles.sort()).toEqual(['manager', 'member'])
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
      const adminHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/organizations', headers: adminHeaders })
      expect(response.statusCode).toBe(200)
      expect((response.json() as Array<{ name: string }>)).toHaveLength(2)
    })

    it('rejects 403 for a caller without accounts:manage, even an org manager', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/organizations', headers })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/organizations/:organizationId (read)', () => {
    it('any member (not just a manager) can view their own organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Acme Corp')
    })

    it('a tenant admin can view any organization, even without membership', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const adminHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers: adminHeaders })
      expect(response.statusCode).toBe(200)
    })

    it('rejects 403 for a caller who is neither a member nor a tenant admin', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const otherOrgId = await createOrgWithManager('acct-x')
      const headers = bearer(await tokenFor('acct-x', [{ organizationId: otherOrgId, roles: ['manager', 'member'] }]))

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}`, headers })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 403 with no bearer token at all', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}` })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET .../organizations/:organizationId/members (roster)', () => {
    it('any member can list the full roster, including role standing', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}/members`, headers })
      expect(response.statusCode).toBe(200)
      const members = response.json() as Array<{ accountId: string, roles: string[] }>
      expect(members.map((m) => m.accountId).sort()).toEqual(['acct-1', 'acct-2'])
    })

    it('rejects 403 for a non-member, non-admin caller', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const otherOrgId = await createOrgWithManager('acct-x')
      const headers = bearer(await tokenFor('acct-x', [{ organizationId: otherOrgId, roles: ['manager', 'member'] }]))

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/organizations/${organizationId}/members`, headers })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('POST .../organizations/:organizationId/members (add-member)', () => {
    it('a manager can add an existing account as a plain member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await setSeatLimit(organizationId, 5)
      await createAccount('acct-2')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-2' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().roles).toEqual(['member'])
    })

    it('a manager can add an account directly as a co-manager via roles', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await setSeatLimit(organizationId, 5)
      await createAccount('acct-2')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-2', roles: ['manager'] },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().roles.sort()).toEqual(['manager', 'member'])
    })

    it('rejects 400 for a role name with no active organization-scope role definition', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await setSeatLimit(organizationId, 5)
      await createAccount('acct-2')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-2', roles: ['not-a-real-role'] },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects 409 for an account that is already a member', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-1' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects 409 once the organization\'s seat limit is reached -- null means one seat, the creator only (ADR 0100)', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().error).toMatch(/seat limit/)
    })

    it('rejects 403 for a caller who is a member but not a manager', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])
      await createAccount('acct-3')

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members`,
        headers,
        payload: { accountId: 'acct-3' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('POST/DELETE .../members/:accountId/roles (grant/revoke a role)', () => {
    it('a manager can grant billingAdmin to a plain member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-2/roles`,
        headers,
        payload: { role: 'billingAdmin' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().roles.sort()).toEqual(['billingAdmin', 'member'])
    })

    it('a manager can revoke billingViewer from a member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member', 'billingViewer'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/roles/billingViewer`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().roles).toEqual(['member'])
    })

    it('rejects 400 granting a role with no active organization-scope role definition', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-2/roles`,
        headers,
        payload: { role: 'not-a-real-role' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects 404 granting a role to an account that is not a member', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-2/roles`,
        headers,
        payload: { role: 'billingAdmin' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('rejects 403 for a plain member with no manager role', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])
      await createAccount('acct-3')
      await seedMembership('acct-3', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-3/roles`,
        headers,
        payload: { role: 'billingAdmin' },
      })
      expect(response.statusCode).toBe(403)
    })

    it('revoking manager from one of several co-managers is a plain change, no succession', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['manager', 'member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2/roles/manager`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().roles).toEqual(['member'])
    })

    it('rejects 409 revoking manager from the only remaining manager with no successor designated', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1/roles/manager`, headers })
      expect(response.statusCode).toBe(409)
    })

    it('auto-promotes the designated successor when the sole manager\'s manager role is revoked', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])
      await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`,
        headers: bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }])),
        payload: { successorAccountId: 'acct-2' },
      })

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1/roles/manager`, headers })

      expect(response.statusCode).toBe(200)
      expect((await membershipFor('acct-2', organizationId))?.roles.sort()).toEqual(['manager', 'member'])
      expect((await membershipFor('acct-1', organizationId))?.roles).toEqual(['member'])
      expect(publisher.calls).toContainEqual({ routingKey: 'organization.manager-succeeded', payload: { organizationId, tenant: 'acme', departingAccountId: 'acct-1', successorAccountId: 'acct-2' } })
    })
  })

  describe('DELETE .../members/:accountId (remove-member)', () => {
    it('detaches a plain member from the organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2`, headers })

      expect(response.statusCode).toBe(204)
      expect((await membershipFor('acct-2', organizationId))?.status).toBe('revoked')
    })

    it('a member can voluntarily remove themselves, no manager role needed', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-2`, headers })
      expect(response.statusCode).toBe(204)
    })

    it('removing the sole manager entirely cascades through the same last-manager guard', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1`, headers })
      expect(response.statusCode).toBe(409)
      expect((await membershipFor('acct-1', organizationId))?.status).toBe('active')
    })

    it('rejects 403 for a plain member acting on someone else', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-2', [{ organizationId, roles: ['member'] }]))
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1`, headers })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('successor designation -- strictly self-only', () => {
    it('a manager can set their own successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`,
        headers,
        payload: { successorAccountId: 'acct-2' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().successorAccountId).toBe('acct-2')
    })

    it('rejects 409 designating a successor who is not an org member', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`,
        headers,
        payload: { successorAccountId: 'not-a-member' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects 403 even for a fellow manager acting on a peer\'s successor -- self-only, no override', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['manager', 'member'])

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-2/successor`,
        headers,
        payload: { successorAccountId: 'acct-1' },
      })
      expect(response.statusCode).toBe(403)
    })

    it('clears a previously-set successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])
      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`,
        headers,
        payload: { successorAccountId: 'acct-2' },
      })

      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().successorAccountId).toBeNull()
    })
  })

  describe('POST /operator/.../members/:accountId/promote-successor -- operator-mediated, no tenant-scoped equivalent', () => {
    it('promotes the pre-designated successor, and only demotes the departing manager (stays a member)', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await createAccount('acct-3')
      await seedMembership('acct-2', organizationId, ['manager', 'member'])
      await seedMembership('acct-3', organizationId, ['member'])
      await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-2/successor`,
        headers: bearer(await tokenFor('acct-2', [{ organizationId, roles: ['manager', 'member'] }])),
        payload: { successorAccountId: 'acct-3' },
      })

      // Works on acct-2 even though acct-1 (not acct-2) remains a manager --
      // incapacitation targets a specific person, not "the sole manager."
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/members/acct-2/promote-successor`,
        headers: operatorHeaders(),
      })
      expect(response.statusCode).toBe(200)
      expect((await membershipFor('acct-3', organizationId))?.roles.sort()).toEqual(['manager', 'member'])
      expect((await membershipFor('acct-2', organizationId))?.roles).toEqual(['member'])
      expect((await membershipFor('acct-1', organizationId))?.roles.sort()).toEqual(['manager', 'member'])
    })

    it('rejects 403 without the operator bearer token', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/members/acct-1/promote-successor`,
      })
      expect(response.statusCode).toBe(403)
    })

    it('rejects 409 when the manager being succeeded has no designated successor', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const response = await app.inject({
        method: 'POST',
        url: `/operator/tenants/acme/organizations/${organizationId}/members/acct-1/promote-successor`,
        headers: operatorHeaders(),
      })
      expect(response.statusCode).toBe(409)
    })

    it('has no tenant-scoped counterpart at all -- not even an org manager can reach it', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/promote-successor`,
        headers,
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('account deletion detaches every organization membership (ADR 0100)', () => {
    it('a deleted plain member is detached from the organization', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])

      const opsHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-2', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      expect((await membershipFor('acct-2', organizationId))?.status).toBe('revoked')
    })

    it('deleting the sole manager with a designated successor auto-promotes it', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', organizationId, ['member'])
      await app.inject({
        method: 'PUT',
        url: `/tenants/acme/organizations/${organizationId}/members/acct-1/successor`,
        headers: bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }])),
        payload: { successorAccountId: 'acct-2' },
      })

      const opsHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      expect((await membershipFor('acct-1', organizationId))?.status).toBe('revoked')
      expect((await membershipFor('acct-2', organizationId))?.roles.sort()).toEqual(['manager', 'member'])
    })

    it('deleting the sole manager with no successor still succeeds, leaving the organization manager-less', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const opsHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-1', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      expect((await membershipFor('acct-1', organizationId))?.status).toBe('revoked')
    })

    it('an account belonging to more than one organization is detached from all of them', async () => {
      const orgA = await createOrgWithManager('acct-1')
      await createAccount('acct-2')
      await seedMembership('acct-2', orgA, ['member'])
      const orgB = await createOrgWithManager('acct-3')
      await seedMembership('acct-2', orgB, ['member'])

      const opsHeaders = bearer(await tokenFor('admin-acct', [], { permissions: ['accounts:manage'] }))
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/accounts/acct-2', headers: opsHeaders, payload: { status: 'deleted' } })
      expect(response.statusCode).toBe(200)

      expect((await membershipFor('acct-2', orgA))?.status).toBe('revoked')
      expect((await membershipFor('acct-2', orgB))?.status).toBe('revoked')
    })
  })

  describe('POST /tenants/:tenantSlug/organizations/:organizationId/invites (org invite, redeemed via identities.resolve)', () => {
    it('a manager can invite by email; redemption creates a membership with the invited role', async () => {
      const organizationId = await createOrgWithManager('acct-1')
      await setSeatLimit(organizationId, 5)

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const inviteResponse = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/invites`,
        headers,
        payload: { email: 'newperson@example.com', organizationRole: 'billingViewer' },
      })
      expect(inviteResponse.statusCode).toBe(201)
      const token = inviteResponse.json().token

      const resolveResponse = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: {
          tenant: 'acme',
          idp: 'dex',
          identityHashes: ['new-person-hash'],
          email: 'newperson@example.com',
          redeem: { type: 'invite', token },
        },
      })
      expect(resolveResponse.statusCode).toBe(200)
      const { accountId, redeemed } = resolveResponse.json()
      expect(redeemed).toBe(true)
      expect((await membershipFor(accountId, organizationId))?.roles.sort()).toEqual(['billingViewer', 'member'])
    })

    it('redemption silently skips joining once the organization\'s seat limit is reached -- mismatch is not an error', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const inviteResponse = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/invites`,
        headers,
        payload: { email: 'second@example.com', organizationRole: 'member' },
      })
      const token = inviteResponse.json().token

      const resolveResponse = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: {
          tenant: 'acme',
          idp: 'dex',
          identityHashes: ['second-person-hash'],
          email: 'second@example.com',
          redeem: { type: 'invite', token },
        },
      })
      expect(resolveResponse.statusCode).toBe(200)
      const { accountId } = resolveResponse.json()
      expect(await membershipFor(accountId, organizationId)).toBeUndefined()
    })

    it('rejects 400 for an organizationRole with no active organization-scope role definition', async () => {
      const organizationId = await createOrgWithManager('acct-1')

      const headers = bearer(await tokenFor('acct-1', [{ organizationId, roles: ['manager', 'member'] }]))
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/acme/organizations/${organizationId}/invites`,
        headers,
        payload: { email: 'x@example.com', organizationRole: 'not-a-real-role' },
      })
      expect(response.statusCode).toBe(400)
    })
  })
})
