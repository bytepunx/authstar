import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: `roleDefinition` (ADR 0047, tower Story 001) -- the role
// catalog itself. See routes/role-definitions.ts's own header comment for
// why this deliberately doesn't wire validation into any role-*granting*
// write path (none exist yet in this repo).

describe('role-definitions -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, publisher, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['roles:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', {
      slug,
      name,
      cookieDomain: `${slug}.authstar.app`,
      createdBy: 'test-harness',
    })
  }

  async function createApplication(tenant: string, slug: string, name = 'Billing') {
    await consequent.handle(`${tenant}:${slug}`, 'application.create', {
      tenant, slug, name, hosts: [], publicUrl: '', exposedProviders: [],
    })
  }

  describe('POST /tenants/:tenantSlug/role-definitions', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/nonexistent/role-definitions',
        headers,
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('creates a tenant-wide role definition and publishes roleDefinition.created', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'admin', scope: 'tenant', description: 'Full tenant admin' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ tenant: 'acme', name: 'admin', scope: 'tenant', status: 'active' })

      const instance = await consequent.fetch('roleDefinition', 'acme:admin')
      expect(instance!.state.status).toBe('active')

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'roleDefinition.created',
        payload: { tenant: 'acme', name: 'admin', scope: 'tenant', status: 'active' },
      })
    })

    it('creates an application-scoped role definition keyed {tenant}:{appSlug}:{name}', async () => {
      await createTenant('acme')
      await createApplication('acme', 'billing')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'viewer', scope: { application: 'billing' } },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().scope).toEqual({ application: 'billing' })

      const instance = await consequent.fetch('roleDefinition', 'acme:billing:viewer')
      expect(instance!.state.status).toBe('active')
    })

    it('rejects an application-scoped role referencing an unknown application', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'viewer', scope: { application: 'nonexistent' } },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects an application-scoped role referencing a suspended application', async () => {
      await createTenant('acme')
      await createApplication('acme', 'billing')
      await app.inject({ method: 'PATCH', url: '/tenants/acme/applications/billing', headers: bearer(await jwt.signToken({ permissions: ['applications:manage'] })), payload: { status: 'suspended' } })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'viewer', scope: { application: 'billing' } },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects a duplicate name+scope under the same tenant with 409', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'admin', scope: 'tenant' } })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects a duplicate name+scope even under truly concurrent requests -- exactly one of N wins (mutex regression)', async () => {
      await createTenant('acme')

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => app.inject({
          method: 'POST',
          url: '/tenants/acme/role-definitions',
          headers,
          payload: { name: 'admin', scope: 'tenant' },
        })),
      )

      const created = responses.filter((r) => r.statusCode === 201)
      const conflicts = responses.filter((r) => r.statusCode === 409)
      expect(created).toHaveLength(1)
      expect(conflicts).toHaveLength(9)
    })

    it('allows the same name under tenant scope and an application scope simultaneously (different keys)', async () => {
      await createTenant('acme')
      await createApplication('acme', 'billing')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'viewer', scope: 'tenant' } })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'viewer', scope: { application: 'billing' } },
      })
      expect(response.statusCode).toBe(201)
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(403)
    })

    it('rejects a malformed scope at the schema level (400)', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/role-definitions',
        headers,
        payload: { name: 'admin', scope: 'bogus' },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /tenants/:tenantSlug/role-definitions', () => {
    it('filters by status and scope', async () => {
      await createTenant('roledeflist-1')
      await createApplication('roledeflist-1', 'billing')
      await app.inject({ method: 'POST', url: '/tenants/roledeflist-1/role-definitions', headers, payload: { name: 'admin', scope: 'tenant' } })
      await app.inject({ method: 'POST', url: '/tenants/roledeflist-1/role-definitions', headers, payload: { name: 'viewer', scope: { application: 'billing' } } })
      await app.inject({ method: 'DELETE', url: `/tenants/roledeflist-1/role-definitions/${encodeURIComponent('roledeflist-1:admin')}`, headers })

      const all = await app.inject({ method: 'GET', url: '/tenants/roledeflist-1/role-definitions' })
      expect((all.json() as unknown[]).length).toBe(2)

      const activeOnly = await app.inject({ method: 'GET', url: '/tenants/roledeflist-1/role-definitions?status=active' })
      expect((activeOnly.json() as Array<{ name: string }>).map((r) => r.name)).toEqual(['viewer'])

      const tenantScopeOnly = await app.inject({ method: 'GET', url: '/tenants/roledeflist-1/role-definitions?scope=tenant' })
      expect((tenantScopeOnly.json() as Array<{ name: string }>).map((r) => r.name)).toEqual(['admin'])

      const appScopeOnly = await app.inject({ method: 'GET', url: '/tenants/roledeflist-1/role-definitions?scope=billing' })
      expect((appScopeOnly.json() as Array<{ name: string }>).map((r) => r.name)).toEqual(['viewer'])
    })

    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/nonexistent/role-definitions' })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /tenants/:tenantSlug/role-definitions/:id', () => {
    it('resolves the URL-encoded composite key', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'admin', scope: 'tenant' } })

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}` })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ tenant: 'acme', name: 'admin', scope: 'tenant' })
    })

    it('returns 404 for a nonexistent key', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:nonexistent')}` })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for a cross-tenant key lookup', async () => {
      await createTenant('acme')
      await createTenant('other')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'admin', scope: 'tenant' } })

      const response = await app.inject({ method: 'GET', url: `/tenants/other/role-definitions/${encodeURIComponent('acme:admin')}` })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/role-definitions/:id', () => {
    beforeEach(async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'admin', scope: 'tenant', description: 'orig' } })
      publisher.calls.length = 0
    })

    it('updates description without publishing (not a lifecycle event)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`,
        headers,
        payload: { description: 'updated' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().description).toBe('updated')
      expect(publisher.calls).toHaveLength(0)
    })

    it('retires a role definition and publishes roleDefinition.retired', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`,
        headers,
        payload: { status: 'retired' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('retired')
      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'roleDefinition.retired',
        payload: { tenant: 'acme', name: 'admin', scope: 'tenant', status: 'retired' },
      })
    })

    it('rejects retiring an already-retired role definition directly via PATCH', async () => {
      await app.inject({ method: 'PATCH', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`, headers, payload: { status: 'retired' } })
      const response = await app.inject({
        method: 'PATCH',
        url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`,
        headers,
        payload: { status: 'retired' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects with 403 for a token with an unrelated grant', async () => {
      const wrongHeaders = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))
      const response = await app.inject({
        method: 'PATCH',
        url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`,
        headers: wrongHeaders,
        payload: { description: 'x' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE /tenants/:tenantSlug/role-definitions/:id', () => {
    beforeEach(async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/role-definitions', headers, payload: { name: 'admin', scope: 'tenant' } })
      publisher.calls.length = 0
    })

    it('retires the role definition and publishes roleDefinition.retired', async () => {
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('retired')

      const instance = await consequent.fetch('roleDefinition', 'acme:admin')
      expect(instance!.state.status).toBe('retired')

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0].routingKey).toBe('roleDefinition.retired')
    })

    it('is idempotent on a retry against an already-retired role definition', async () => {
      await app.inject({ method: 'DELETE', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`, headers })
      publisher.calls.length = 0

      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('retired')
      expect(publisher.calls).toHaveLength(0)
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}` })
      expect(response.statusCode).toBe(403)
    })
  })
})

// Story 013's operator tree -- same handlers, bearer-token auth instead of
// `roles:manage`. Added per bytepunx/authstar-steward#1: steward calls this
// tree with the shared operator token, not a tenant-scoped internal JWT, and
// this route previously had no operator-tree registration at all (unlike
// accounts.ts/invites.ts/providers.ts, which all register both).
describe('role-definitions -- operator tree', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    app = await buildApp({
      consequent,
      publisher,
      provisioningConfig: {
        selfServiceEnabled: false,
        operatorToken: 'op-secret',
        defaultProvider: { name: 'dex', clientId: 'c1', discoveryUrl: 'https://dex/.well-known', scope: ['openid'] },
        defaultProviderClientSecret: 'secret',
      },
    })
    await consequent.handle('acme', 'tenant.create', {
      slug: 'acme', name: 'Acme', domain: 'acme.test', cookieDomain: 'acme.test', adminContactId: 'c-1', createdBy: 'test-harness',
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('GET /operator/tenants/:tenantSlug/role-definitions requires a valid operator bearer token', async () => {
    const response = await app.inject({ method: 'GET', url: '/operator/tenants/acme/role-definitions' })
    expect(response.statusCode).toBe(403)
  })

  it('GET /operator/tenants/:tenantSlug/role-definitions lists definitions with just the operator token, no X-Operator-Actor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/operator/tenants/acme/role-definitions',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('POST /operator/tenants/:tenantSlug/role-definitions requires X-Operator-Actor', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/role-definitions',
      headers: { authorization: 'Bearer op-secret' },
      payload: { name: 'admin', scope: 'tenant' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('creates and retires a role definition end to end via the operator tree', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/role-definitions',
      headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      payload: { name: 'admin', scope: 'tenant' },
    })
    expect(create.statusCode).toBe(201)
    expect(publisher.calls[0].routingKey).toBe('roleDefinition.created')

    const retire = await app.inject({
      method: 'DELETE',
      url: `/operator/tenants/acme/role-definitions/${encodeURIComponent('acme:admin')}`,
      headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
    })
    expect(retire.statusCode).toBe(200)
    expect(retire.json().status).toBe('retired')
  })
})
