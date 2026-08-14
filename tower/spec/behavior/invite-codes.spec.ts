import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: design/stories/tower/007-invites-and-invite-codes.md's
// `inviteCode` half -- built from scratch this pass, see
// `actors/invite_code_actor.ts`'s own header comment.

describe('invite-codes -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['invite:code:issue'], accountId: 'acct-issuer' }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 't' })
  }

  async function createActiveRoleDefinition(tenantSlug: string, name: string, scope: 'tenant' | { application: string } = 'tenant') {
    const key = scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
    await consequent.handle(key, 'roleDefinition.create', { tenant: tenantSlug, name, scope, description: '' })
  }

  describe('POST /tenants/:tenantSlug/invite-codes', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({ method: 'POST', url: '/tenants/nonexistent/invite-codes', headers, payload: { code: 'LAUNCH50' } })
      expect(response.statusCode).toBe(404)
    })

    it('creates an active invite code', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invite-codes',
        headers,
        payload: { code: 'LAUNCH50', trialDurationDays: 14, maxRedemptions: 100 },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toMatchObject({ code: 'LAUNCH50', status: 'active', redemptionCount: 0, issuedBy: 'acct-issuer' })

      const inviteCode = await consequent.fetch('inviteCode', 'acme:LAUNCH50')
      expect(inviteCode!.state.status).toBe('active')
    })

    it('rejects a body carrying a permissions field -- not accepted on this route at all', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invite-codes',
        headers,
        payload: { code: 'LAUNCH50', permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }] },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects a duplicate code under the same tenant with 409, in any prior status', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })
      await app.inject({ method: 'DELETE', url: '/tenants/acme/invite-codes/LAUNCH50', headers })

      const response = await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })
      expect(response.statusCode).toBe(409)
    })

    it('allows the same code across two different tenants', async () => {
      await createTenant('acme')
      await createTenant('other')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })

      const response = await app.inject({ method: 'POST', url: '/tenants/other/invite-codes', headers, payload: { code: 'LAUNCH50' } })
      expect(response.statusCode).toBe(201)
    })

    it('rejects a duplicate code even under truly concurrent requests -- exactly one of N wins (mutex regression)', async () => {
      await createTenant('acme')
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })),
      )
      expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(1)
      expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(9)
    })

    it('rejects a role not backed by an active role definition', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/invite-codes', headers,
        payload: { code: 'LAUNCH50', roles: [{ name: 'admin', scope: 'tenant' }] },
      })
      expect(response.statusCode).toBe(400)
    })

    it('accepts a role backed by an active role definition', async () => {
      await createTenant('acme')
      await createActiveRoleDefinition('acme', 'member')
      const response = await app.inject({
        method: 'POST', url: '/tenants/acme/invite-codes', headers,
        payload: { code: 'LAUNCH50', roles: [{ name: 'member', scope: 'tenant' }] },
      })
      expect(response.statusCode).toBe(201)
    })

    // Dedicated tenant slugs, not reused by any other `it()` in this file --
    // `callerOutstandingCount`'s `find()` query counts every active invite
    // code for `{tenant, issuedBy}` across the whole run, and consequent's
    // *default in-memory* search adapter (test-only; `consequent-postgres`'s
    // real one does a proper upsert-by-id, confirmed directly against its
    // `set_<type>_search_fields` SQL) is a module-level singleton shared
    // across every `buildInMemoryConsequent()` call in this process. Reusing
    // `acme` here would count invite codes created by *other* tests in this
    // file (same `issuedBy: 'acct-issuer'` from the shared `headers`),
    // exactly the test-isolation artifact `applications.spec.ts` already
    // documents for this same adapter.
    it('enforces the issuer\'s own maxOutstanding limit for invite:code:issue', async () => {
      await createTenant('maxout-1')
      await consequent.handle('acct-issuer', 'account.create', { accountId: 'acct-issuer', tenant: 'maxout-1', contactId: 'c-1' })
      await consequent.handle('acct-issuer', 'account.grant-permission', {
        permission: { grant: 'invite:code:issue', scope: 'tenant', maxOutstanding: 1 },
      })

      const first = await app.inject({ method: 'POST', url: '/tenants/maxout-1/invite-codes', headers, payload: { code: 'FIRST' } })
      expect(first.statusCode).toBe(201)

      const second = await app.inject({ method: 'POST', url: '/tenants/maxout-1/invite-codes', headers, payload: { code: 'SECOND' } })
      expect(second.statusCode).toBe(409)
    })

    it('does not count a revoked code against maxOutstanding', async () => {
      await createTenant('maxout-2')
      await consequent.handle('acct-issuer', 'account.create', { accountId: 'acct-issuer', tenant: 'maxout-2', contactId: 'c-1' })
      await consequent.handle('acct-issuer', 'account.grant-permission', {
        permission: { grant: 'invite:code:issue', scope: 'tenant', maxOutstanding: 1 },
      })

      await app.inject({ method: 'POST', url: '/tenants/maxout-2/invite-codes', headers, payload: { code: 'FIRST' } })
      await app.inject({ method: 'DELETE', url: '/tenants/maxout-2/invite-codes/FIRST', headers })

      const response = await app.inject({ method: 'POST', url: '/tenants/maxout-2/invite-codes', headers, payload: { code: 'SECOND' } })
      expect(response.statusCode).toBe(201)
    })

    it('allows unlimited issuance when maxOutstanding is null (no permission grant recorded)', async () => {
      await createTenant('maxout-3')
      const first = await app.inject({ method: 'POST', url: '/tenants/maxout-3/invite-codes', headers, payload: { code: 'FIRST' } })
      const second = await app.inject({ method: 'POST', url: '/tenants/maxout-3/invite-codes', headers, payload: { code: 'SECOND' } })
      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(201)
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', payload: { code: 'LAUNCH50' } })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/invite-codes', () => {
    // A dedicated tenant slug -- see the maxOutstanding tests' own comment
    // above for why (same `find()`/singleton-search-adapter reasoning).
    it('lists invite codes for a tenant, filterable by status', async () => {
      await createTenant('codelist-1')
      await app.inject({ method: 'POST', url: '/tenants/codelist-1/invite-codes', headers, payload: { code: 'ACTIVE1' } })
      await app.inject({ method: 'POST', url: '/tenants/codelist-1/invite-codes', headers, payload: { code: 'REVOKED1' } })
      await app.inject({ method: 'DELETE', url: '/tenants/codelist-1/invite-codes/REVOKED1', headers })

      const all = await app.inject({ method: 'GET', url: '/tenants/codelist-1/invite-codes' })
      expect((all.json() as unknown[])).toHaveLength(2)

      const activeOnly = await app.inject({ method: 'GET', url: '/tenants/codelist-1/invite-codes?status=active' })
      expect((activeOnly.json() as Array<{ code: string }>).map((c) => c.code)).toEqual(['ACTIVE1'])
    })
  })

  describe('GET /tenants/:tenantSlug/invite-codes/:code', () => {
    it('resolves the bare code to the internal composite key', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })

      const response = await app.inject({ method: 'GET', url: '/tenants/acme/invite-codes/LAUNCH50' })
      expect(response.statusCode).toBe(200)
      expect(response.json().code).toBe('LAUNCH50')
    })

    it('returns 404 for a cross-tenant code lookup', async () => {
      await createTenant('acme')
      await createTenant('other')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })

      const response = await app.inject({ method: 'GET', url: '/tenants/other/invite-codes/LAUNCH50' })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/invite-codes/:code', () => {
    it('revokes an active invite code', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/invite-codes/LAUNCH50', headers, payload: { status: 'revoked' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects revoking an already-revoked code', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })
      await app.inject({ method: 'PATCH', url: '/tenants/acme/invite-codes/LAUNCH50', headers, payload: { status: 'revoked' } })

      const response = await app.inject({ method: 'PATCH', url: '/tenants/acme/invite-codes/LAUNCH50', headers, payload: { status: 'revoked' } })
      expect(response.statusCode).toBe(409)
    })
  })

  describe('DELETE /tenants/:tenantSlug/invite-codes/:code', () => {
    it('is idempotent on a retry against an already-revoked code', async () => {
      await createTenant('acme')
      await app.inject({ method: 'POST', url: '/tenants/acme/invite-codes', headers, payload: { code: 'LAUNCH50' } })

      await app.inject({ method: 'DELETE', url: '/tenants/acme/invite-codes/LAUNCH50', headers })
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/invite-codes/LAUNCH50', headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/invite-codes/LAUNCH50' })
      expect(response.statusCode).toBe(403)
    })
  })
})
