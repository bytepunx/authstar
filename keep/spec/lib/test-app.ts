import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from './in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createFakeStripeClientFactory, createFakeStripeState, type FakeStripeState } from './fake-stripe-client.js'
import { createInMemoryStripeConfigStore, type StripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache, type RoleReferenceSnapshot } from '../../src/lib/role-reference-cache.js'
import { createInMemoryEntitlementPublisher, createInMemorySequenceProvider, type EntitlementEvent } from '../../src/lib/entitlement-publisher.js'

// One place every behavior/e2e spec builds its app from -- same in-memory
// `consequent` instance, same fake Stripe/role-cache/entitlement-publisher
// wiring, so every test tier assembles the app identically and differs only
// in which HTTP calls / assertions it makes (same shape as tower's own
// `spec/lib/in-memory-consequent.ts`, extended for keep's extra
// dependencies).

// A reasonably permissive default role reference snapshot -- most tests
// don't care about role validation specifics and can grant roles under
// 'demo-app'; tests that specifically exercise the ADR 0047 validation path
// build their own narrower snapshot.
const defaultRoleSnapshot: RoleReferenceSnapshot = {
  'demo-app': ['member', 'admin', 'billing-admin'],
}

export interface TestApp {
  app: FastifyInstance
  consequent: ConsequentApi
  stripeState: FakeStripeState
  stripeConfig: StripeConfigStore
  publisher: { published: EntitlementEvent[] }
}

export default async function buildTestApp(roleSnapshot: RoleReferenceSnapshot = defaultRoleSnapshot): Promise<TestApp> {
  const consequent = await buildInMemoryConsequent()
  const stripeState = createFakeStripeState()
  const stripeConfig = createInMemoryStripeConfigStore()
  const roleCache = createRoleReferenceCache(roleSnapshot)
  const publisher = createInMemoryEntitlementPublisher()

  const app = await buildApp({
    consequent,
    stripeClients: createFakeStripeClientFactory(stripeState),
    stripeConfig,
    roleCache,
    entitlements: publisher,
    sequences: createInMemorySequenceProvider(),
  })

  return { app, consequent, stripeState, stripeConfig, publisher }
}
