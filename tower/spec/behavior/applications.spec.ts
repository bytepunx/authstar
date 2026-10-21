import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: the tower half of design/stories/tower/004-applications-
// and-providers.md (Applications only -- see routes/applications.ts's own
// header comment for the deliberate Providers-CRUD exclusion) plus ADR
// 0047/0051/0067's requirements this route surface must satisfy.

describe('applications -- API contract', () => {
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
    headers = bearer(await jwt.signToken({ permissions: ['applications:manage'] }))
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

  async function createProvider(tenant: string, name: string) {
    await consequent.handle(`${tenant}:${name}`, 'provider.create', {
      tenant,
      name,
      clientId: 'client-id',
      discoveryUrl: 'https://idp.test/.well-known/openid-configuration',
      scope: ['openid'],
    })
  }

  describe('POST /tenants/:tenantSlug/applications', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/nonexistent/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('rejects "_admin" outright, always', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: '_admin', name: 'Nope' },
      })
      expect(response.statusCode).toBe(400)
      expect(publisher.calls).toHaveLength(0)
    })

    it('rejects a slug that fails the pattern', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'Not Valid!', name: 'Nope' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('creates an application, issuing tenant.add-application and publishing application.created', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toMatchObject({
        tenant: 'acme', slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'], status: 'active',
      })

      const application = await consequent.fetch('application', 'acme:billing')
      expect(application!.state.status).toBe('active')

      const tenant = await consequent.fetch('tenant', 'acme')
      expect((tenant!.state as { applications: Array<{ slug: string }> }).applications).toContainEqual({ slug: 'billing', name: 'Billing' })

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'application.created',
        payload: { tenant: 'acme', application: 'billing', name: 'Billing', status: 'active' },
      })
    })

    it('rejects a duplicate slug under the same tenant with 409', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing Again' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects a duplicate slug even under truly concurrent requests -- exactly one of N wins (mutex regression)', async () => {
      await createTenant('acme')

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => app.inject({
          method: 'POST',
          url: '/tenants/acme/applications',
          headers,
          payload: { slug: 'billing', name: 'Billing' },
        })),
      )

      const created = responses.filter((r) => r.statusCode === 201)
      const conflicts = responses.filter((r) => r.statusCode === 409)
      expect(created).toHaveLength(1)
      expect(conflicts).toHaveLength(9)

      const tenant = await consequent.fetch('tenant', 'acme')
      expect((tenant!.state as { applications: unknown[] }).applications).toHaveLength(1)
    })

    it('allows the same slug across two different tenants', async () => {
      await createTenant('acme')
      await createTenant('other')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/other/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing' },
      })
      expect(response.statusCode).toBe(201)
    })

    it('rejects a publicUrl whose host is not present in hosts (ADR 0051)', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'], publicUrl: 'https://wrong-host.test' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('accepts a publicUrl whose host is present in hosts', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'], publicUrl: 'https://billing.acme.authstar.app' },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().publicUrl).toBe('https://billing.acme.authstar.app')
    })

    it('rejects exposedProviders referencing an unknown provider', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', exposedProviders: ['google'] },
      })
      expect(response.statusCode).toBe(400)
    })

    it('accepts exposedProviders referencing an existing, active provider', async () => {
      await createTenant('acme')
      await createProvider('acme', 'google')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', exposedProviders: ['google'] },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().exposedProviders).toEqual(['google'])
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        payload: { slug: 'billing', name: 'Billing' },
      })
      expect(response.statusCode).toBe(403)
    })

    // design/adrs/0101-api-keys.md.
    it('auto-seeds an active application-scope api-keys:manage role definition', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })

      const roleDefinition = await consequent.fetch('roleDefinition', 'acme:billing:api-keys:manage')
      expect(roleDefinition!.state).toMatchObject({
        tenant: 'acme',
        name: 'api-keys:manage',
        scope: { application: 'billing' },
        status: 'active',
      })
    })

    it('is idempotent about seeding api-keys:manage on a retried create', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })
      // A second create for the same slug 409s (duplicate), but the seeding
      // helper itself must not error or duplicate-create the role on any
      // path that re-checks it -- covered directly via the backfill route
      // below, which re-runs the exact same idempotent-checked seed call
      // against an application that already has the role.
      const roleDefinition = await consequent.fetch('roleDefinition', 'acme:billing:api-keys:manage')
      expect(roleDefinition!.state.status).toBe('active')
    })
  })

  describe('GET /tenants/:tenantSlug/applications', () => {
    // A dedicated tenant slug, not reused by any other `it()` in this file --
    // consequent's *default in-memory* search adapter (only ever used in
    // tests; `consequent-postgres`'s real one does a proper upsert-by-id,
    // confirmed directly against its `set_<type>_search_fields` SQL) is a
    // module-level singleton shared across every `buildInMemoryConsequent()`
    // call in this process, and its field index never deduplicates repeated
    // writes of the same id -- reusing a tenant slug already exercised by
    // earlier tests in this file would make `find()` return accumulated
    // duplicate ids, a test-isolation artifact of that in-memory adapter,
    // not a real bug in this route or in production's Postgres-backed one.
    it('excludes _admin and, by default, deleted applications', async () => {
      await createTenant('applist-1')
      await app.inject({ method: 'POST', url: '/tenants/applist-1/applications', headers, payload: { slug: 'billing', name: 'Billing' } })
      await app.inject({ method: 'POST', url: '/tenants/applist-1/applications', headers, payload: { slug: 'reports', name: 'Reports' } })
      await app.inject({ method: 'DELETE', url: '/tenants/applist-1/applications/reports', headers })

      const response = await app.inject({ method: 'GET', url: '/tenants/applist-1/applications' })
      expect(response.statusCode).toBe(200)
      const slugs = (response.json() as Array<{ slug: string }>).map((a) => a.slug)
      expect(slugs).toEqual(['billing'])
    })

    it('includes deleted applications when includeDeleted=true', async () => {
      await createTenant('applist-2')
      await app.inject({ method: 'POST', url: '/tenants/applist-2/applications', headers, payload: { slug: 'reports', name: 'Reports' } })
      await app.inject({ method: 'DELETE', url: '/tenants/applist-2/applications/reports', headers })

      const response = await app.inject({ method: 'GET', url: '/tenants/applist-2/applications?includeDeleted=true' })
      const slugs = (response.json() as Array<{ slug: string }>).map((a) => a.slug)
      expect(slugs).toContain('reports')
    })

    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/nonexistent/applications' })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /tenants/:tenantSlug/applications/:appSlug', () => {
    it('returns 404 for an application that does not exist', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/applications/nonexistent' })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for "_admin" (system-managed, invisible to this route)', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/applications/_admin' })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for a cross-tenant appSlug lookup', async () => {
      await createTenant('acme')
      await createTenant('other')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })

      const response = await app.inject({ method: 'GET', url: '/tenants/other/applications/billing' })
      expect(response.statusCode).toBe(404)
    })

    it('returns the application\'s current state', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/applications/billing' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ tenant: 'acme', slug: 'billing', name: 'Billing', status: 'active' })
    })
  })

  describe('PATCH /tenants/:tenantSlug/applications/:appSlug', () => {
    beforeEach(async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST',
        url: '/tenants/acme/applications',
        headers,
        payload: { slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'] },
      })
      publisher.calls.length = 0
    })

    it('updates name and publishes nothing hosts-specific when hosts is untouched', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme/applications/billing',
        headers,
        payload: { name: 'Billing Renamed' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Billing Renamed')
      expect(publisher.calls).toHaveLength(0)
    })

    it('updates hosts and publishes application.hosts-changed', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme/applications/billing',
        headers,
        payload: { hosts: ['new-billing.acme.authstar.app'] },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().hosts).toEqual(['new-billing.acme.authstar.app'])
      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0].routingKey).toBe('application.hosts-changed')
    })

    it('rejects a publicUrl/hosts combination that violates ADR 0051 on update', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme/applications/billing',
        headers,
        payload: { publicUrl: 'https://not-in-hosts.test' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('suspends an active application and publishes application.suspended', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme/applications/billing',
        headers,
        payload: { status: 'suspended' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('suspended')
      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'application.suspended',
        payload: { tenant: 'acme', application: 'billing', name: 'Billing', status: 'suspended' },
      })
    })

    it('rejects suspending an application that is already suspended', async () => {
      await app.inject({ method: 'PATCH', url: '/tenants/acme/applications/billing', headers, payload: { status: 'suspended' } })
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/applications/billing', headers, payload: { status: 'suspended' } })
      expect(response.statusCode).toBe(409)
    })

    it('returns 404 for "_admin"', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/applications/_admin', headers, payload: { name: 'x' } })
      expect(response.statusCode).toBe(404)
    })

    it('rejects with 403 for a token with an unrelated grant', async () => {
      const wrongHeaders = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme/applications/billing',
        headers: wrongHeaders,
        payload: { name: 'x' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE /tenants/:tenantSlug/applications/:appSlug', () => {
    beforeEach(async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/applications', headers, payload: { slug: 'billing', name: 'Billing' } })
      publisher.calls.length = 0
    })

    it('soft-deletes the application and publishes application.deleted', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/applications/billing', headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('deleted')

      const application = await consequent.fetch('application', 'acme:billing')
      expect(application!.state.status).toBe('deleted')

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'application.deleted',
        payload: { tenant: 'acme', application: 'billing', name: 'Billing', status: 'deleted' },
      })
    })

    it('is idempotent on a retry against an already-deleted application', async () => {
      await app.inject({ method: 'DELETE', url: '/tenants/acme/applications/billing', headers })
      publisher.calls.length = 0

      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/applications/billing', headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('deleted')
      expect(publisher.calls).toHaveLength(0)
    })

    it('returns 404 for "_admin"', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/applications/_admin', headers })
      expect(response.statusCode).toBe(404)
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/applications/billing' })
      expect(response.statusCode).toBe(403)
    })
  })
})

// Story 013's operator tree -- same handlers, bearer-token auth instead of
// `applications:manage`. Added while registering `loci` for the adopted
// `bytepunx` tenant (bytepunx/authstar-tower#3): steward calls this tree
// with the shared operator token, not a tenant-scoped internal JWT, and this
// route previously had no operator-tree registration at all (unlike
// role-definitions.ts, fixed the same way for bytepunx/authstar-steward#1).
describe('applications -- operator tree', () => {
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

  it('GET /operator/tenants/:tenantSlug/applications requires a valid operator bearer token', async () => {
    const response = await app.inject({ method: 'GET', url: '/operator/tenants/acme/applications' })
    expect(response.statusCode).toBe(403)
  })

  it('GET /operator/tenants/:tenantSlug/applications lists applications with just the operator token, no X-Operator-Actor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/operator/tenants/acme/applications',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('POST /operator/tenants/:tenantSlug/applications requires X-Operator-Actor', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/applications',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'loci', name: 'Loci' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('creates and deletes an application end to end via the operator tree', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/applications',
      headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      payload: { slug: 'loci', name: 'Loci', hosts: ['loci.acme.test'] },
    })
    expect(create.statusCode).toBe(201)
    expect(publisher.calls[0].routingKey).toBe('application.created')

    const remove = await app.inject({
      method: 'DELETE',
      url: '/operator/tenants/acme/applications/loci',
      headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
    })
    expect(remove.statusCode).toBe(200)
    expect(remove.json().status).toBe('deleted')
  })

  // design/adrs/0101-api-keys.md: pre-existing applications never went
  // through `createApplication`'s own auto-seed call, since that call site
  // didn't exist yet when they were created -- simulated here by creating
  // the `application` actor directly (bypassing the route entirely), the
  // same way a genuinely pre-existing row would already exist.
  describe('POST /operator/tenants/:tenantSlug/applications/backfill-api-keys-manage-role', () => {
    beforeEach(async () => {
      await consequent.handle('acme:loci', 'application.create', {
        tenant: 'acme', slug: 'loci', name: 'Loci', hosts: [], publicUrl: '', exposedProviders: [],
      })
    })

    it('requires a valid operator bearer token', async () => {
      const response = await app.inject({ method: 'POST', url: '/operator/tenants/acme/applications/backfill-api-keys-manage-role' })
      expect(response.statusCode).toBe(403)
    })

    it('requires X-Operator-Actor', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/applications/backfill-api-keys-manage-role',
        headers: { authorization: 'Bearer op-secret' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('seeds api-keys:manage for every active application missing it', async () => {
      const before = await consequent.fetch('roleDefinition', 'acme:loci:api-keys:manage')
      expect(before!.state.createdAt).toBeFalsy()

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/applications/backfill-api-keys-manage-role',
        headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ seeded: 1 })

      const after = await consequent.fetch('roleDefinition', 'acme:loci:api-keys:manage')
      expect(after!.state).toMatchObject({ name: 'api-keys:manage', scope: { application: 'loci' }, status: 'active' })
    })

    it('is idempotent -- safe to re-run against an application that already has the role', async () => {
      await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/applications/backfill-api-keys-manage-role',
        headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/applications/backfill-api-keys-manage-role',
        headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ seeded: 1 })
    })

    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/nonexistent/applications/backfill-api-keys-manage-role',
        headers: { authorization: 'Bearer op-secret', 'x-operator-actor': 'alice' },
      })
      expect(response.statusCode).toBe(404)
    })
  })
})
