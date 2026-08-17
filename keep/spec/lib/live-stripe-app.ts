import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from './in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createStripeClientFactory } from '../../src/lib/stripe-client.js'
import { createInMemoryStripeConfigStore, type StripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache, type RoleReferenceSnapshot } from '../../src/lib/role-reference-cache.js'
import { createInMemoryEntitlementPublisher, createInMemorySequenceProvider, type EntitlementEvent } from '../../src/lib/entitlement-publisher.js'
import { createInternalJwtFixture, bearer, type InternalTokenOverrides } from './internal-jwt.js'

// spec/live's own counterpart to spec/lib/test-app.ts's buildTestApp --
// same in-memory consequent/role-cache/entitlement-publisher wiring, but
// swaps the fake Stripe client for the real one (stripe-client.ts's
// createStripeClientFactory, unused anywhere else in this test suite) dialed
// against a genuine test-mode secret key. Everything else about the app
// (routes, actors, auth) is identical to every other tier -- only the Stripe
// boundary itself becomes real.
//
// The webhook secret is NOT fetched from Stripe's dashboard -- Stripe's own
// SDK (stripe.webhooks.generateTestHeaderString/constructEvent) treats it as
// a plain shared string for computing/verifying HMAC-SHA256, not something
// tied to a registered webhook endpoint (confirmed against the installed
// SDK's own types, node_modules/stripe/types/Webhooks.d.ts). Tests that
// exercise webhook signature verification pick their own constant and use
// it on both sides (generating the signature and configuring the tenant).

export const LIVE_TEST_TENANT = 'acme'

const defaultRoleSnapshot: RoleReferenceSnapshot = {
  [LIVE_TEST_TENANT]: { 'demo-app': ['member', 'admin', 'billing-admin'] },
}

export interface LiveTestApp {
  app: FastifyInstance
  consequent: ConsequentApi
  stripeConfig: StripeConfigStore
  publisher: { published: EntitlementEvent[] }
  headers(overrides?: InternalTokenOverrides): Promise<{ authorization: string }>
}

export function liveStripeSecretKey(): string {
  const key = process.env.STRIPE_LIVE_TEST_SECRET_KEY
  if (!key) throw new Error('STRIPE_LIVE_TEST_SECRET_KEY is not set -- see keep/TESTING.md')
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    // Fails closed rather than risking a real charge against a live-mode
    // key pasted in by mistake -- this tier only ever runs against Stripe's
    // test mode.
    throw new Error('STRIPE_LIVE_TEST_SECRET_KEY does not look like a Stripe test-mode key (expected an sk_test_/rk_test_ prefix)')
  }
  return key
}

export default async function buildLiveTestApp(roleSnapshot: RoleReferenceSnapshot = defaultRoleSnapshot): Promise<LiveTestApp> {
  const consequent = await buildInMemoryConsequent()
  const stripeConfig = createInMemoryStripeConfigStore()
  const roleCache = createRoleReferenceCache(roleSnapshot)
  const publisher = createInMemoryEntitlementPublisher()
  const jwt = await createInternalJwtFixture()

  const app = await buildApp({
    consequent,
    stripeClients: createStripeClientFactory(),
    stripeConfig,
    roleCache,
    entitlements: publisher,
    sequences: createInMemorySequenceProvider(),
    authstarGetKey: jwt.getKey,
  })

  return {
    app,
    consequent,
    stripeConfig,
    publisher,
    headers: async (overrides) => bearer(await jwt.signToken(overrides)),
  }
}
