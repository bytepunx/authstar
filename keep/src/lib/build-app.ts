import Fastify, { type FastifyInstance } from 'fastify'
import { authstarFastifyPlugin, perTenantJwksKeyProvider, type JWTVerifyGetKey } from '@bytepunx/authstar-fastify'
import type { ConsequentApi } from './consequent-types.js'
import type { StripeClientFactory } from './stripe-client.js'
import type { StripeConfigStore } from './stripe-config.js'
import type { RoleReferenceCache } from './role-reference-cache.js'
import type { EntitlementPublisher, SequenceProvider } from './entitlement-publisher.js'
import { createInMemorySequenceProvider } from './entitlement-publisher.js'
import registerPlanMappingRoutes from '../routes/plan-mappings.js'
import registerCheckoutSessionRoutes from '../routes/checkout-sessions.js'
import registerBillingReadRoutes from '../routes/billing-reads.js'
import registerWebhookRoutes from '../routes/webhooks.js'
import registerTrialRoutes from '../routes/trials.js'
import registerCouponRoutes from '../routes/coupons.js'
import registerUsageRoutes from '../routes/usage.js'
import registerStripeConfigRoutes from '../routes/stripe-config.js'

export interface BuildAppOptions {
  consequent: ConsequentApi
  stripeClients: StripeClientFactory
  stripeConfig: StripeConfigStore
  roleCache: RoleReferenceCache
  entitlements: EntitlementPublisher
  sequences?: SequenceProvider
  logger?: boolean
  // Story 007's internal-JWT verification key -- keep has no Host to
  // resolve a tenant from itself (one shared deployment for every tenant,
  // ADR 0089), so this defaults to `perTenantJwksKeyProvider(baseDomain)`,
  // which reads the tenant hint off the token's own protected header
  // instead. Tests override with a `staticKeyProvider` fixture pinned to a
  // locally-generated keypair, so they never make a real JWKS fetch.
  baseDomain?: string
  authstarGetKey?: JWTVerifyGetKey
}

// A single place to assemble the fastify instance so behavior/e2e/integration
// tests (and the real server entrypoint) all build the app the same way,
// differing only in which `consequent` instance and which fakes/real
// adapters (Stripe, entitlement publishing, role reference cache) they hand
// in -- same shape as tower's own build-app.ts.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's own default AJV options set `removeAdditional: true` -- an
    // unknown request-body field is silently stripped, not rejected, even
    // where a route schema declares `additionalProperties: false`
    // (confirmed against @fastify/ajv-compiler's defaults in tower's own
    // pilot). Overridden globally so `additionalProperties: false` means
    // what it says everywhere in this service.
    ajv: { customOptions: { removeAdditional: false } },
  })

  // Stripe webhook signature verification (routes/webhooks.ts) needs the
  // exact raw request bytes the signature was computed over -- fastify's
  // default JSON parsing discards them. Captures the raw buffer onto
  // `request.rawBody` for every JSON request (cheap, and every other route
  // in this service only ever reads `request.body`, so this has no effect
  // on them beyond the one extra buffer-to-string-to-JSON step already
  // implicit in normal parsing).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer
    if ((body as Buffer).length === 0) {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.decorate('consequent', options.consequent)
  app.decorate('stripeClients', options.stripeClients)
  app.decorate('stripeConfig', options.stripeConfig)
  app.decorate('roleCache', options.roleCache)
  app.decorate('entitlements', options.entitlements)
  app.decorate('sequences', options.sequences ?? createInMemorySequenceProvider())

  const authstarGetKey = options.authstarGetKey ?? perTenantJwksKeyProvider(options.baseDomain ?? 'authstar.test')
  // `required: false` -- same posture as tower's own build-app.ts:
  // `requirePermission` decides every failure mode as one generic 403, not
  // this plugin's default 401. `POST /tenants/:tenantSlug/usage-records`
  // (routes/usage.ts) is deliberately untouched by this plugin's
  // `request.authstar` -- its two real callers (portcullis's synchronous
  // usage path, keep's own not-yet-implemented credential-verified batched
  // path) never carry a tenant-admin's internal JWT at all (Story 005).
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => authstarGetKey, required: false })

  await app.register(registerPlanMappingRoutes)
  await app.register(registerCheckoutSessionRoutes)
  await app.register(registerBillingReadRoutes)
  await app.register(registerWebhookRoutes)
  await app.register(registerTrialRoutes)
  await app.register(registerCouponRoutes)
  await app.register(registerUsageRoutes)
  await app.register(registerStripeConfigRoutes)

  return app
}
