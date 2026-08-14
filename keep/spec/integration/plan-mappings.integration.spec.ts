import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createFakeStripeClientFactory, createFakeStripeState } from '../lib/fake-stripe-client.js'
import { createInMemoryStripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache } from '../../src/lib/role-reference-cache.js'
import { createInMemoryEntitlementPublisher } from '../../src/lib/entitlement-publisher.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'

// Integration tier: `consequent`'s real `consequent-postgres` adapters
// against a real, disposable Postgres (testcontainers) -- proves keep's
// actor definitions actually work against Postgres, not just the in-memory
// fake the behavior/e2e tiers use. Scoped to this one service and
// Postgres, its own direct dependency -- Stripe/role-cache/entitlement-
// publishing stay faked here too, same as tower's own integration tier
// scopes to "real Postgres, nothing else."
//
// A CONFIRMED UPSTREAM BUG used to make `consequent.find()` (and so this
// service's list routes) untestable against real Postgres -- `consequent`
// never awaited the search adapter's own `find()`, and separately
// `consequent-postgres` required a differently-shaped criteria argument
// and returned internal system ids instead of actor ids. Fixed directly in
// both packages (see their own history); the list-route assertions below
// were rewritten off the raw-SQL workaround they originally needed and now
// exercise the real HTTP route.

const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

describe('plan mappings and webhook-driven actors -- real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let app: FastifyInstance
  let consequent: ConsequentApi
  let pgAdapters: ReturnType<typeof initializePostgresAdapters>
  let manageHeaders: { authorization: string }
  let readHeaders: { authorization: string }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start()
    pgAdapters = initializePostgresAdapters({ connectionString: container.getConnectionUri() })
    consequent = await initializeConsequent({
      actors: actorsPath,
      actorStore: pgAdapters.actor,
      eventStore: pgAdapters.event,
      searchAdapter: pgAdapters.search,
      logging: { level: 'none' },
    })

    const stripeState = createFakeStripeState()
    stripeState.prices.set('price_basic', { unitAmount: 1200, currency: 'usd', interval: 'month' })
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })

    const jwt = await createInternalJwtFixture()
    manageHeaders = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))
    readHeaders = bearer(await jwt.signToken({ permissions: ['billing:read'] }))

    app = await buildApp({
      consequent,
      stripeClients: createFakeStripeClientFactory(stripeState),
      stripeConfig,
      roleCache: createRoleReferenceCache({ 'demo-app': ['member', 'admin'] }),
      entitlements: createInMemoryEntitlementPublisher(),
      authstarGetKey: jwt.getKey,
    })
  }, 60_000) // container pull + start can genuinely take a while on a cold cache

  afterAll(async () => {
    await app.close()
    // Must close the pg connection pool *before* stopping the container --
    // stopping first leaves an open client connection with nowhere to go,
    // surfacing as a noisy uncaught exception even though the tests
    // themselves already passed (same ordering tower's own integration
    // tier's afterAll documents).
    await pgAdapters.close()
    await container.stop()
  })

  it('persists a created plan mapping across a fresh fetch -- proves the write actually landed in Postgres', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Basic', grantedRoles: [{ application: 'demo-app', role: 'member' }] },
    })
    expect(create.statusCode).toBe(201)
    const id = create.json().id

    const fetched = await app.inject({ method: 'GET', url: `/tenants/acme/plan-mappings/${id}`, headers: manageHeaders })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().name).toBe('Basic')
    expect(fetched.json().unitAmount).toBe(1200)
  })

  it('retiring a plan mapping persists across a fresh fetch-by-id', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Retire Me' },
    })
    const id = create.json().id

    const retire = await app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${id}`, headers: manageHeaders })
    expect(retire.statusCode).toBe(200)
    expect(retire.json().status).toBe('retired')

    const fetched = await app.inject({ method: 'GET', url: `/tenants/acme/plan-mappings/${id}`, headers: manageHeaders })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().status).toBe('retired')
  })

  it('lists plan mappings filtered by status through the real consequent.find()-backed route', async () => {
    const active = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'Still Active' },
    })
    const activeId = active.json().id

    const retired = await app.inject({
      method: 'POST',
      url: '/tenants/acme/plan-mappings',
      headers: manageHeaders,
      payload: { stripePriceId: 'price_basic', name: 'To Retire' },
    })
    const retiredId = retired.json().id
    await app.inject({ method: 'DELETE', url: `/tenants/acme/plan-mappings/${retiredId}`, headers: manageHeaders })

    const activeOnly = await app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings', headers: manageHeaders })
    expect(activeOnly.statusCode).toBe(200)
    const activeIds = activeOnly.json().map((m: { id: string }) => m.id)
    expect(activeIds).toContain(activeId)
    expect(activeIds).not.toContain(retiredId)

    const all = await app.inject({ method: 'GET', url: '/tenants/acme/plan-mappings?status=all', headers: manageHeaders })
    const allIds = all.json().map((m: { id: string }) => m.id)
    expect(allIds).toEqual(expect.arrayContaining([activeId, retiredId]))
  })

  it('webhook-driven subscription creation persists to Postgres (fetch-by-id route)', async () => {
    // Not `find()`-dependent -- `subscription` is `identifiedBy:
    // 'stripeSubscriptionId'` directly (ADR 0083), so both the webhook
    // handler's own lookup-by-id and this test's read are plain `fetch()`
    // calls, unaffected by the `find()` bug.
    const payload = JSON.stringify({
      id: 'evt_pg_1',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_pg_1',
          customer: 'cus_pg_1',
          status: 'active',
          current_period_end: 1_700_000_000,
          items: { data: [{ price: { id: 'price_basic' } }] },
          metadata: { scope: JSON.stringify({ account: 'acct_pg_1' }) },
        },
      },
    })

    const webhook = await app.inject({
      method: 'POST',
      url: '/_authstar/webhooks/stripe',
      headers: { 'x-authstar-tenant-slug': 'acme', 'stripe-signature': 'valid:whsec_acme', 'content-type': 'application/json' },
      payload,
    })
    expect(webhook.statusCode).toBe(200)

    const subscription = await app.inject({ method: 'GET', url: '/tenants/acme/subscriptions/sub_pg_1', headers: readHeaders })
    expect(subscription.statusCode).toBe(200)
    expect(subscription.json().stripePriceId).toBe('price_basic')

    // The `customer` record's own read route is `find()`-backed (there's
    // no direct-by-id route -- customer is looked up by scope).
    const customer = await app.inject({ method: 'GET', url: '/tenants/acme/accounts/acct_pg_1/customer', headers: readHeaders })
    expect(customer.statusCode).toBe(200)
    expect(customer.json().stripeCustomerId).toBe('cus_pg_1')
  })
})
