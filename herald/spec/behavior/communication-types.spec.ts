import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// Behavior tier: the public HTTP contract from
// design/stories/herald/003-communication-types-and-templates.md.
//
// Tenant slugs are generated fresh per test (`uniqueSlug`), not hardcoded
// literals -- see spec/lib/unique.ts for why: consequent's in-memory
// default adapters are a process-wide singleton, so a `find()`-based list
// assertion would otherwise see data from every other test in this file.

describe('communication types -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['communication-types:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /tenants/:tenantSlug/communication-types', () => {
    it('creates with defaults applied', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types`,
        payload: { type: 'invite-sent' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.type).toBe('invite-sent')
      expect(body.tenant).toBe(tenant)
      expect(body.category).toBe('transactional')
      expect(body.retentionDays).toBe(30)
      expect(body.status).toBe('active')
    })

    it('accepts an explicit category and retentionDays', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types`,
        payload: { type: 'newsletter', category: 'marketing', retentionDays: 90 },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.category).toBe('marketing')
      expect(body.retentionDays).toBe(90)
    })

    it('rejects a duplicate key with 409, but the same type name for a different tenant is fine', async () => {
      const tenant = uniqueSlug('acme')
      const otherTenant = uniqueSlug('globex')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

      const dup = await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
      expect(dup.statusCode).toBe(409)

      // Same `type` string, different tenant -- not a collision (Story 001's
      // whole reason for tenant-scoping the key in the first place).
      const otherResponse = await app.inject({ headers, method: 'POST', url: `/tenants/${otherTenant}/communication-types`, payload: { type: 'invite-sent' } })
      expect(otherResponse.statusCode).toBe(201)
    })

    it('rejects unknown fields at the schema level (400)', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types`,
        payload: { type: 'invite-sent', notAField: true },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects an invalid category enum value (400)', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types`,
        payload: { type: 'invite-sent', category: 'spam' },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /tenants/:tenantSlug/communication-types', () => {
    it('defaults to active only', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'old-type' } })
      await app.inject({ headers, method: 'DELETE', url: `/tenants/${tenant}/communication-types/old-type` })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types` })
      const body = response.json()
      expect(body).toHaveLength(1)
      expect(body[0].type).toBe('invite-sent')
    })

    it('includes deprecated when toggled', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'old-type' } })
      await app.inject({ headers, method: 'DELETE', url: `/tenants/${tenant}/communication-types/old-type` })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types?includeDeprecated=true` })
      expect(response.json()).toHaveLength(2)
    })
  })

  describe('GET /tenants/:tenantSlug/communication-types/:type', () => {
    it('returns 404 for a type that was never created', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/nonexistent` })
      expect(response.statusCode).toBe(404)
    })

    it('returns the type once created', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/invite-sent` })
      expect(response.statusCode).toBe(200)
      expect(response.json().type).toBe('invite-sent')
    })
  })

  describe('PATCH /tenants/:tenantSlug/communication-types/:type', () => {
    it('edits category/retentionDays', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

      const response = await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/communication-types/invite-sent`,
        payload: { retentionDays: 7 },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().retentionDays).toBe(7)
    })

    it('DELETE is an alias for PATCH { status: "deprecated" }', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

      const response = await app.inject({ headers, method: 'DELETE', url: `/tenants/${tenant}/communication-types/invite-sent` })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('deprecated')
    })

    it('rejects re-deprecating an already-deprecated type (409, not a silent no-op)', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
      await app.inject({ headers, method: 'DELETE', url: `/tenants/${tenant}/communication-types/invite-sent` })

      const response = await app.inject({ headers, method: 'DELETE', url: `/tenants/${tenant}/communication-types/invite-sent` })
      expect(response.statusCode).toBe(409)
    })

    it('rejects "active" as a status value at the schema level -- structurally unreachable', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

      const response = await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/communication-types/invite-sent`,
        payload: { status: 'active' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for a type that was never created', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/communication-types/nonexistent`,
        payload: { retentionDays: 7 },
      })
      expect(response.statusCode).toBe(404)
    })
  })
})
