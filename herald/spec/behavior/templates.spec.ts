import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// Behavior tier: design/stories/herald/003-communication-types-and-templates.md's
// template versioning routes. Tenant AND communicationType are both
// generated fresh per test (see spec/lib/unique.ts) -- `template` is a
// flake-identified actor, so a stale cross-test search-index entry can
// resolve to phantom default state rather than simply "old real data,"
// making a hardcoded, reused type name the riskier choice here.

describe('templates -- API contract', () => {
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

  async function setup() {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    return { tenant, type }
  }

  describe('POST .../templates', () => {
    it('creates version 1 for a brand new (tenant, type) pair', async () => {
      const { tenant, type } = await setup()
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'Welcome {{name}}', bodyTemplate: 'Hi {{name}}, click {{link}}' },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.version).toBe(1)
      expect(body.tenant).toBe(tenant)
      expect(body.communicationType).toBe(type)
      expect(typeof body.templateId).toBe('string')
      expect(body.templateId.length).toBeGreaterThan(0)
    })

    it('each subsequent create increments the version -- no edit, no delete', async () => {
      const { tenant, type } = await setup()
      await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'v1 subject', bodyTemplate: 'v1 body' },
      })
      const second = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'v2 subject', bodyTemplate: 'v2 body' },
      })
      expect(second.json().version).toBe(2)

      const third = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'v3 subject', bodyTemplate: 'v3 body' },
      })
      expect(third.json().version).toBe(3)
    })

    it('rejects malformed mustache syntax at creation time (400)', async () => {
      const { tenant, type } = await setup()
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'unterminated {{name', bodyTemplate: 'fine' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('a template referencing a variable that never arrives is not an error at creation time', async () => {
      const { tenant, type } = await setup()
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'Hi {{doesNotExist}}', bodyTemplate: 'body' },
      })
      expect(response.statusCode).toBe(201)
    })

    it('rejects unknown fields at the schema level (400)', async () => {
      const { tenant, type } = await setup()
      const response = await app.inject({
        headers,
        method: 'POST',
        url: `/tenants/${tenant}/communication-types/${type}/templates`,
        payload: { subjectTemplate: 'a', bodyTemplate: 'b', extra: true },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET .../templates', () => {
    it('lists all versions, newest first, no default filtering', async () => {
      const { tenant, type } = await setup()
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'v1', bodyTemplate: 'v1' } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'v2', bodyTemplate: 'v2' } })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/${type}/templates` })
      const body = response.json()
      expect(body).toHaveLength(2)
      expect(body[0].version).toBe(2)
      expect(body[1].version).toBe(1)
    })

    it('is scoped per tenant -- a different tenant\'s templates never leak in', async () => {
      const { tenant, type } = await setup()
      const otherTenant = uniqueSlug('globex')
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'acme v1', bodyTemplate: 'x' } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${otherTenant}/communication-types`, payload: { type } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${otherTenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'globex v1', bodyTemplate: 'x' } })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/${type}/templates` })
      const body = response.json()
      expect(body).toHaveLength(1)
      expect(body[0].subjectTemplate).toBe('acme v1')
    })
  })

  describe('GET .../templates/:version', () => {
    it('fetches a single version by number', async () => {
      const { tenant, type } = await setup()
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'v1', bodyTemplate: 'v1' } })
      await app.inject({ headers, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'v2', bodyTemplate: 'v2' } })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/${type}/templates/1` })
      expect(response.statusCode).toBe(200)
      expect(response.json().subjectTemplate).toBe('v1')
    })

    it('returns 404 for a version that does not exist', async () => {
      const { tenant, type } = await setup()
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communication-types/${type}/templates/99` })
      expect(response.statusCode).toBe(404)
    })
  })
})
