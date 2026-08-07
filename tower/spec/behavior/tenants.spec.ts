import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: the public HTTP contract (routes/proxy/010-.. onward's own
// convention applied here to tower) -- request/response shapes, status
// codes, and the acceptance-criteria-level rules from
// design/stories/tower/011-tenant-management-and-key-rotation.md. Uses
// `fastify.inject()` (no real network) against real `consequent` behavior
// backed by its in-memory default adapters.

describe('tenant management -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent })
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

  describe('GET /tenants/:tenantSlug', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/nonexistent' })
      expect(response.statusCode).toBe(404)
    })

    it('returns the tenant\'s non-secret fields, excluding applications/providers', async () => {
      await createTenant('acme')

      const response = await app.inject({ method: 'GET', url: '/tenants/acme' })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.slug).toBe('acme')
      expect(body.name).toBe('Acme')
      expect(body.status).toBe('active')
      expect(body.cookie.httpOnly).toBe(true)
      // Story 011: the detail view deliberately excludes these, even though
      // the same fetched actor state technically has them.
      expect(body.applications).toBeUndefined()
      expect(body.providers).toBeUndefined()
    })
  })

  describe('PATCH /tenants/:tenantSlug', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/nonexistent',
        payload: { name: 'New Name' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('edits name freely', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { name: 'Acme Corp' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Acme Corp')
    })

    it('edits cookie fields but never accepts httpOnly', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { cookie: { maxAge: 3600 } },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.cookie.maxAge).toBe(3600)
      expect(body.cookie.httpOnly).toBe(true)
    })

    it('rejects httpOnly in the request body at the schema level (400), never silently ignoring it', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { cookie: { httpOnly: false } },
      })

      // additionalProperties: false on the cookie schema rejects this
      // outright -- httpOnly is absent from the schema, not merely
      // ignored if present (ADR 0062).
      expect(response.statusCode).toBe(400)
    })

    it('allows active -> suspended', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { status: 'suspended' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('suspended')
    })

    it('rejects suspending an already-suspended tenant (409, not a silent no-op)', async () => {
      await createTenant('acme')
      await consequent.handle('acme', 'tenant.suspend', { status: 'suspended' })

      const response = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { status: 'suspended' },
      })

      expect(response.statusCode).toBe(409)
    })

    it('rejects "active" and "deleted" as status values at the schema level -- structurally unreachable, not just denied', async () => {
      await createTenant('acme')

      const reactivate = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { status: 'active' },
      })
      const del = await app.inject({
        method: 'PATCH',
        url: '/tenants/acme',
        payload: { status: 'deleted' },
      })

      expect(reactivate.statusCode).toBe(400)
      expect(del.statusCode).toBe(400)
    })
  })
})
