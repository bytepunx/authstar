import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createFakeStripeClientFactory, createFakeStripeState, type FakeStripeState } from '../lib/fake-stripe-client.js'
import { createInMemoryStripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache } from '../../src/lib/role-reference-cache.js'
import { createInMemoryEntitlementPublisher, createInMemorySequenceProvider } from '../../src/lib/entitlement-publisher.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'
import { createSecretHasher } from '../../src/lib/hash.js'

// Proves `plan-mappings.ts` (and, by the same one-line pattern, trials.ts/
// coupons.ts) actually calls `app.roleBackfill.ensureFresh(tenantSlug)`
// before validating `grantedRoles` -- not just that the cache/backfill
// modules work correctly in isolation (role-reference-cache.spec.ts,
// role-reference-backfill.spec.ts already cover that). Every other
// behavior spec in this repo uses `test-app.ts`'s default no-op backfill,
// which would never surface a wiring mistake here -- this spec builds the
// app directly with a real (non-no-op) `RoleReferenceBackfill` instead.

describe('plan-mappings route -- role reference backfill wiring (ADR 0047)', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let ensureFreshCalls: string[]
  let headers: { authorization: string }
  let stripeState: FakeStripeState

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    stripeState = createFakeStripeState()
    const roleCache = createRoleReferenceCache()
    const jwt = await createInternalJwtFixture()
    headers = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))
    ensureFreshCalls = []

    app = await buildApp({
      consequent,
      stripeClients: createFakeStripeClientFactory(stripeState),
      stripeConfig: createInMemoryStripeConfigStore(),
      roleCache,
      // A fake backfill that only populates the cache the *first* time
      // it's asked about a given tenant -- exactly `ensureFresh`'s real
      // once-per-tenant contract, just with an in-test assertion hook
      // instead of a real tower HTTP call.
      roleBackfill: {
        async ensureFresh(tenant) {
          ensureFreshCalls.push(tenant)
          roleCache.upsertApplication(tenant, 'billing', true)
          roleCache.upsertRoleDefinition(tenant, 'billing', 'member', true)
        },
        async refreshAll() {},
      },
      entitlements: createInMemoryEntitlementPublisher(),
      sequences: createInMemorySequenceProvider(),
      authstarGetKey: jwt.getKey,
      secretHasher: createSecretHasher('test-credential-salt'),
    })

    stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })
    await app.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
  })

  afterEach(async () => {
    await app.close()
  })

  it('backfills before validating -- a role invalid before ensureFresh runs is accepted once it does', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'billing', role: 'member' }] },
    })

    expect(response.statusCode).toBe(201)
    expect(ensureFreshCalls).toEqual(['acme'])
  })

  it('calls ensureFresh with the request\'s own tenant, not a hardcoded one', async () => {
    await app.stripeConfig.set('other-tenant', { secretKey: 'sk_test_other', webhookSecret: 'whsec_other' })

    await app.inject({
      method: 'POST',
      url: '/tenants/other-tenant/plan-mappings',
      headers,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'billing', role: 'member' }] },
    })

    expect(ensureFreshCalls).toEqual(['other-tenant'])
  })

  it('also runs on PATCH when grantedRoles is included', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers,
      payload: { stripePriceId: 'price_basic', name: 'Basic' },
    })
    ensureFreshCalls.length = 0

    const response = await app.inject({
      method: 'PATCH',
      url: `/tenants/acme/plan-mappings/${created.json().id}`,
      headers,
      payload: { grantedRoles: [{ application: 'billing', role: 'member' }] },
    })

    expect(response.statusCode).toBe(200)
    expect(ensureFreshCalls).toEqual(['acme'])
  })

  it('does not call ensureFresh on PATCH when grantedRoles is absent', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers,
      payload: { stripePriceId: 'price_basic', name: 'Basic' },
    })
    ensureFreshCalls.length = 0

    await app.inject({
      method: 'PATCH',
      url: `/tenants/acme/plan-mappings/${created.json().id}`,
      headers,
      payload: { name: 'Renamed' },
    })

    expect(ensureFreshCalls).toEqual([])
  })
})
