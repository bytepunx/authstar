import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from './in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createFakeStripeClientFactory, createFakeStripeState, type FakeStripeState } from './fake-stripe-client.js'
import { createInMemoryStripeConfigStore, type StripeConfigStore } from '../../src/lib/stripe-config.js'
import { createRoleReferenceCache, type RoleReferenceSnapshot } from '../../src/lib/role-reference-cache.js'
import { createOrganizationManagerCache, type OrganizationManagerCache } from '../../src/lib/organization-manager-cache.js'
import { createInMemoryEntitlementPublisher, createInMemorySequenceProvider, type EntitlementEvent } from '../../src/lib/entitlement-publisher.js'
import { createInternalJwtFixture, bearer, type InternalTokenOverrides } from './internal-jwt.js'

// One place every behavior/e2e spec builds its app from -- same in-memory
// `consequent` instance, same fake Stripe/role-cache/entitlement-publisher
// wiring, so every test tier assembles the app identically and differs only
// in which HTTP calls / assertions it makes (same shape as tower's own
// `spec/lib/in-memory-consequent.ts`, extended for keep's extra
// dependencies).

// A reasonably permissive default role reference snapshot -- most tests
// don't care about role validation specifics and can grant roles under
// 'acme'/'demo-app'; tests that specifically exercise the ADR 0047
// validation path build their own narrower snapshot. Nested by tenant
// (`role-reference-cache.ts`'s real shape, ADR 0047) -- was a flat
// `application -> roles` map before the cache became tenant-scoped.
const defaultRoleSnapshot: RoleReferenceSnapshot = {
  acme: { 'demo-app': ['member', 'admin', 'billing-admin'] },
}

export interface TestApp {
  app: FastifyInstance
  consequent: ConsequentApi
  stripeState: FakeStripeState
  stripeConfig: StripeConfigStore
  publisher: { published: EntitlementEvent[] }
  // ADR 0098: pre-seed an organization's managers[] before triggering a
  // webhook that needs to resolve `{organization}` scope -- tests call
  // `organizationManagers.addManager(orgId, accountId)` directly, the same
  // way production's `organization-reference-consumer.ts` would.
  organizationManagers: OrganizationManagerCache
  // Story 007's internal-JWT bearer headers -- `headers()` with no
  // `permissions` override signs a token with none (useful for the 403
  // case); pass the grant(s) a given route needs.
  headers(overrides?: InternalTokenOverrides): Promise<{ authorization: string }>
}

export default async function buildTestApp(roleSnapshot: RoleReferenceSnapshot = defaultRoleSnapshot): Promise<TestApp> {
  const consequent = await buildInMemoryConsequent()
  const stripeState = createFakeStripeState()
  const stripeConfig = createInMemoryStripeConfigStore()
  const roleCache = createRoleReferenceCache(roleSnapshot)
  const organizationManagers = createOrganizationManagerCache()
  const publisher = createInMemoryEntitlementPublisher()
  const jwt = await createInternalJwtFixture()

  const app = await buildApp({
    consequent,
    stripeClients: createFakeStripeClientFactory(stripeState),
    stripeConfig,
    roleCache,
    organizationManagers,
    entitlements: publisher,
    sequences: createInMemorySequenceProvider(),
    authstarGetKey: jwt.getKey,
  })

  return {
    app,
    consequent,
    stripeState,
    stripeConfig,
    publisher,
    organizationManagers,
    headers: async (overrides) => bearer(await jwt.signToken(overrides)),
  }
}
