import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'
import planMappingActor, { type PlanMappingState } from '../../src/actors/plan_mapping_actor.js'

// Behavior tier: the public HTTP contract for
// design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md's
// "Plan Mappings" section -- request/response shapes, status codes, and the
// specific rules (roles validation against the reference cache,
// Stripe pricing resolved server-side and never client-supplied,
// DELETE-is-retire, retired mappings excluded from the default list).

describe('plan mappings -- API contract', () => {
  let t: TestApp
  let headers: { authorization: string }

  beforeEach(async () => {
    t = await buildTestApp()
    headers = await t.headers({ permissions: ['billing:manage'] })
    t.stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    t.stripeState.prices.set('price_yearly', { unitAmount: 10000, currency: 'usd', interval: 'year' })
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('POST /tenants/:tenantSlug/plan-mappings', () => {
    it('creates a mapping, resolving pricing fields from Stripe rather than accepting them in the body', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', roles: [{ application: 'demo-app', role: 'member' }] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.unitAmount).toBe(1000)
      expect(body.currency).toBe('usd')
      expect(body.interval).toBe('month')
      expect(body.status).toBe('active')
      expect(body.id).toBeTruthy()
    })

    it('rejects a roles entry referencing an unknown application/role (400), not silently accepted', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', roles: [{ application: 'demo-app', role: 'nonexistent-role' }] },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects a stripePriceId that cannot be resolved against the tenant\'s Stripe account', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_does_not_exist', name: 'Ghost' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects unknown body fields at the schema level', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', unitAmount: 9999 },
      })

      // unitAmount is deliberately absent from the create schema -- Stripe
      // is authoritative, never accepted as untrusted client input.
      expect(response.statusCode).toBe(400)
    })

    it('rejects when the tenant has no stripe configuration', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/unconfigured/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })

      expect(response.statusCode).toBe(409)
    })

    // design/adrs/0101-api-keys.md.
    it('accepts apiKeyLimit/apiKeyRateLimit, defaulting both to null when omitted', async () => {
      const withoutFields = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      expect(withoutFields.json()).toMatchObject({ apiKeyLimit: null, apiKeyRateLimit: null })

      const withFields = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: {
          stripePriceId: 'price_basic',
          name: 'Basic With Keys',
          apiKeyLimit: 5,
          apiKeyRateLimit: { requestsPerMinute: 60, burst: 10 },
        },
      })
      expect(withFields.statusCode).toBe(201)
      expect(withFields.json()).toMatchObject({
        apiKeyLimit: 5,
        apiKeyRateLimit: { requestsPerMinute: 60, burst: 10 },
      })
    })
  })

  describe('GET /tenants/:tenantSlug/plan-mappings', () => {
    async function createMapping(name: string) {
      const response = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name },
      })
      return response.json()
    }

    it('defaults to active-only, excluding retired mappings', async () => {
      const active = await createMapping('Active Plan')
      const retired = await createMapping('Retired Plan')
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${retired.id}`, headers })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers })
      const body = response.json()

      expect(body.map((m: { id: string }) => m.id)).toEqual([active.id])
    })

    it('includes retired mappings when status=all is passed', async () => {
      const active = await createMapping('Active Plan')
      const retired = await createMapping('Retired Plan')
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${retired.id}`, headers })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings?status=all', headers })
      const ids = response.json().map((m: { id: string }) => m.id).sort()

      expect(ids).toEqual([active.id, retired.id].sort())
    })

    it('scopes results to the requesting tenant only', async () => {
      await createMapping('Acme Plan')
      await t.app.inject({
        method: 'POST',
        url: '/tenants/other/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Other Plan' },
      })

      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers })
      expect(response.json()).toHaveLength(1)
    })
  })

  describe('GET /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('returns 404 for an id that was never created', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings/nonexistent', headers })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when the mapping belongs to a different tenant (cross-tenant is 404, not 403)', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({ method: 'GET', url: `/tenants/other/plan-mappings/${id}`, headers })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('updates name/seatLimit/meter', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { name: 'Basic Plus', seatLimit: 10, meter: 'api-calls' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBe('Basic Plus')
      expect(body.seatLimit).toBe(10)
      expect(body.meter).toBe('api-calls')
    })

    it('updates apiKeyLimit/apiKeyRateLimit', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { apiKeyLimit: 3, apiKeyRateLimit: { requestsPerMinute: 30 } },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        apiKeyLimit: 3,
        apiKeyRateLimit: { requestsPerMinute: 30 },
      })
    })

    it('applies the same roles validation as create', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { roles: [{ application: 'unknown-app', role: 'member' }] },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // ADR 0108: a plan's roles are `roles`; `grantedRoles` is a deprecated
  // input alias, and no response carries it.
  describe('roles, with grantedRoles as a deprecated input alias', () => {
    const member = { application: 'demo-app', role: 'member' }
    const admin = { application: 'demo-app', role: 'admin' }

    async function create(payload: Record<string, unknown>) {
      return t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic', ...payload },
      })
    }

    it('stores roles sent as roles, and answers roles with no grantedRoles', async () => {
      const response = await create({ roles: [member] })

      expect(response.statusCode).toBe(201)
      expect(response.json().roles).toEqual([member])
      expect(response.json()).not.toHaveProperty('grantedRoles')
    })

    it('stores a create that sends grantedRoles alone as roles', async () => {
      const response = await create({ grantedRoles: [member] })

      expect(response.statusCode).toBe(201)
      expect(response.json().roles).toEqual([member])
      expect(response.json()).not.toHaveProperty('grantedRoles')
    })

    it('stores an update that sends grantedRoles alone as roles', async () => {
      const { id } = (await create({ roles: [member] })).json()

      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/acme/plan-mappings/${id}`,
        headers,
        payload: { grantedRoles: [member, admin] },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().roles).toEqual([member, admin])
      expect(response.json()).not.toHaveProperty('grantedRoles')
    })

    it('takes roles over grantedRoles when a body sends both', async () => {
      const response = await create({ roles: [admin], grantedRoles: [member] })

      expect(response.statusCode).toBe(201)
      expect(response.json().roles).toEqual([admin])
    })

    it('validates the grantedRoles alias as it validates roles', async () => {
      const response = await create({ grantedRoles: [{ application: 'demo-app', role: 'nonexistent-role' }] })

      expect(response.statusCode).toBe(400)
    })

    it('answers roles and no grantedRoles on GET, list and single', async () => {
      const { id } = (await create({ grantedRoles: [member] })).json()

      const one = await t.app.inject({ method: 'GET', url: `/tenants/acme/plan-mappings/${id}`, headers })
      expect(one.json().roles).toEqual([member])
      expect(one.json()).not.toHaveProperty('grantedRoles')

      const list = await t.app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers })
      for (const mapping of list.json()) {
        expect(mapping).toHaveProperty('roles')
        expect(mapping).not.toHaveProperty('grantedRoles')
      }
    })
  })

  describe('DELETE /tenants/:tenantSlug/plan-mappings/:id', () => {
    it('is an alias for PATCH { status: "retired" }', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('retired')
    })

    it('rejects retiring an already-retired mapping (409, not a silent no-op)', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/tenants/acme/plan-mappings',
        headers,
        payload: { stripePriceId: 'price_basic', name: 'Basic' },
      })
      const { id } = created.json()
      await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })

      const response = await t.app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers })
      expect(response.statusCode).toBe(409)
    })
  })
})

// Events persisted before ADR 0108 carry the plan's roles as `grantedRoles`;
// replaying them must still give the mapping its roles.
describe('plan mapping actor -- events written before the roles rename', () => {
  const member = { application: 'demo-app', role: 'member' }

  function freshState(): PlanMappingState {
    return structuredClone(planMappingActor().state) as PlanMappingState
  }

  it('reads grantedRoles from a legacy created event as roles', () => {
    const state = freshState()
    const legacy = {
      tenant: 'acme', stripePriceId: 'price_basic', name: 'Basic', seatLimit: null, grantedRoles: [member],
      meter: null, apiKeyLimit: null, apiKeyRateLimit: null, unitAmount: 1000, currency: 'usd', interval: 'month',
    }
    planMappingActor().events.created(state, legacy as never)
    expect(state.roles).toEqual([member])
  })

  it('reads grantedRoles from a legacy updated event as roles', () => {
    const state = freshState()
    planMappingActor().events.updated(state, { grantedRoles: [member] } as never)
    expect(state.roles).toEqual([member])
  })
})
