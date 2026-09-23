import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: the Providers half of design/stories/tower/004-
// applications-and-providers.md (Applications half already covered by
// applications.spec.ts) plus ADR 0047/0051/0053/0067/0073/0082.

describe('providers -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, signetAdmin, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['providers:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 'test-harness' })
  }

  async function createApplication(tenant: string, slug: string, exposedProviders: string[] = []) {
    await consequent.handle(`${tenant}:${slug}`, 'application.create', {
      tenant, slug, name: slug, hosts: [], publicUrl: '', exposedProviders,
    })
    await consequent.handle(tenant, 'tenant.add-application', { slug, name: slug })
  }

  describe('POST /tenants/:tenantSlug/providers', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'POST', url: '/tenants/nonexistent/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('creates a provider and pushes clientSecret to signet -- never returns it', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 'super-secret', scope: ['openid'] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('dex')
      expect(body.clientId).toBe('c1')
      expect(body.status).toBe('active')
      expect(body.discoveryStatus).toEqual({ status: 'ok', checkedAt: null, error: null })
      expect(body.clientSecret).toBeUndefined()

      expect(signetAdmin.calls).toHaveLength(1)
      expect(signetAdmin.calls[0]).toEqual({
        targetService: 'portcullis',
        key: 'tenant-acme-provider-dex-client-secret',
        value: 'super-secret',
      })

      const tenant = await consequent.fetch('tenant', 'acme')
      expect((tenant?.state as any).providers).toEqual([{ name: 'dex' }])
    })

    it('rejects a duplicate provider name for the same tenant', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })

      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex2/.well-known', clientId: 'c2', clientSecret: 's2' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('requires providers:manage', async () => {
      await createTenant('acme')
      const unprivileged = bearer(await jwt.signToken({ permissions: [] }))
      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers: unprivileged,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/providers', () => {
    it('lists providers, excluding removed ones by default', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'okta', discoveryUrl: 'https://okta/.well-known', clientId: 'c2', clientSecret: 's2' },
      })
      await app.inject({ method: 'DELETE', url: '/tenants/acme/providers/okta', headers })

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/providers' })
      expect(response.statusCode).toBe(200)
      const names = (response.json() as Array<{ name: string }>).map((p) => p.name)
      expect(names).toEqual(['dex'])

      const withRemoved = await app.inject({ method: 'GET', url: '/tenants/acme/providers?includeRemoved=true' })
      expect((withRemoved.json() as Array<{ name: string }>).map((p) => p.name).sort()).toEqual(['dex', 'okta'])
    })
  })

  describe('PATCH /tenants/:tenantSlug/providers/:name', () => {
    it('updates non-secret fields and rotates the secret independently', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })

      const response = await app.inject({
        method: 'PATCH', url: '/tenants/acme/providers/dex', headers,
        payload: { clientId: 'c1-new', clientSecret: 'rotated-secret' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().clientId).toBe('c1-new')

      expect(signetAdmin.calls).toHaveLength(2)
      expect(signetAdmin.calls[1]).toEqual({
        targetService: 'portcullis',
        key: 'tenant-acme-provider-dex-client-secret',
        value: 'rotated-secret',
      })
    })

    it('rejects removal while a regular application still exposes this provider', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })
      await createApplication('acme', 'billing', ['dex'])

      const response = await app.inject({
        method: 'PATCH', url: '/tenants/acme/providers/dex', headers, payload: { status: 'removed' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('rejects removal that would leave _admin with zero providers', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })
      await consequent.handle('acme:_admin', 'application.create', {
        tenant: 'acme', slug: '_admin', name: 'Admin', hosts: [], publicUrl: '', exposedProviders: ['dex'],
      })

      const response = await app.inject({
        method: 'PATCH', url: '/tenants/acme/providers/dex', headers, payload: { status: 'removed' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('allows removal once nothing references it, and is retry-safe', async () => {
      await createTenant('acme')
      await app.inject({
        method: 'POST', url: '/tenants/acme/providers', headers,
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 's1' },
      })

      const first = await app.inject({
        method: 'PATCH', url: '/tenants/acme/providers/dex', headers, payload: { status: 'removed' },
      })
      expect(first.statusCode).toBe(200)
      expect(first.json().status).toBe('removed')

      const second = await app.inject({ method: 'DELETE', url: '/tenants/acme/providers/dex', headers })
      expect(second.statusCode).toBe(200)
      expect(second.json().status).toBe('removed')
    })
  })
})
