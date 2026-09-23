import type { ConsequentApi } from './consequent-types.js'
import type { StripeClientFactory } from './stripe-client.js'
import type { StripeConfigStore } from './stripe-config.js'
import type { RoleReferenceCache } from './role-reference-cache.js'
import type { RoleReferenceBackfill } from './role-reference-backfill.js'
import type { EntitlementPublisher, SequenceProvider } from './entitlement-publisher.js'
import type { SecretHasher } from './hash.js'

declare module 'fastify' {
  interface FastifyInstance {
    consequent: ConsequentApi
    stripeClients: StripeClientFactory
    stripeConfig: StripeConfigStore
    roleCache: RoleReferenceCache
    roleBackfill: RoleReferenceBackfill
    entitlements: EntitlementPublisher
    sequences: SequenceProvider
    secretHasher: SecretHasher
  }
  interface FastifyRequest {
    // Populated by build-app.ts's custom `application/json` content-type
    // parser -- Stripe webhook signature verification needs the exact raw
    // bytes the signature was computed over, not fastify's normal
    // re-parsed-then-implicitly-re-serializable JSON body.
    rawBody: Buffer
  }
}
