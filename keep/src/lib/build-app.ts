import Fastify, { type FastifyInstance } from 'fastify'
import { authstarFastifyPlugin, perTenantJwksKeyProvider, type JWTVerifyGetKey } from '@bytepunx/authstar-fastify'
import type { ConsequentApi } from './consequent-types.js'
import type { StripeClientFactory } from './stripe-client.js'
import type { StripeConfigStore } from './stripe-config.js'
import type { RoleReferenceCache } from './role-reference-cache.js'
import type { RoleReferenceBackfill } from './role-reference-backfill.js'
import { createNoopRoleReferenceBackfill } from './role-reference-backfill.js'
import type { EntitlementPublisher, SequenceProvider } from './entitlement-publisher.js'
import { createInMemorySequenceProvider } from './entitlement-publisher.js'
import type { SecretHasher } from './hash.js'
import registerPlanMappingRoutes from '../routes/plan-mappings.js'
import registerCheckoutSessionRoutes from '../routes/checkout-sessions.js'
import registerPortalSessionRoutes from '../routes/portal-sessions.js'
import registerBillingReadRoutes from '../routes/billing-reads.js'
import registerWebhookRoutes from '../routes/webhooks.js'
import registerTrialRoutes from '../routes/trials.js'
import registerCouponRoutes from '../routes/coupons.js'
import registerUsageRoutes from '../routes/usage.js'
import registerStripeConfigRoutes from '../routes/stripe-config.js'
import registerMeRoutes from '../routes/me.js'

export interface BuildAppOptions {
  consequent: ConsequentApi
  stripeClients: StripeClientFactory
  stripeConfig: StripeConfigStore
  roleCache: RoleReferenceCache
  // ADR 0047's per-tenant startup/on-first-touch backfill against tower --
  // defaults to a no-op so every existing test (which pre-seeds `roleCache`
  // directly and has no tower to poll) keeps working unchanged; `server.ts`
  // supplies the real one.
  roleBackfill?: RoleReferenceBackfill
  entitlements: EntitlementPublisher
  sequences?: SequenceProvider
  // Story 001/005's usage-reporting-credential hashing (ADR 0102): sourced
  // from signet by `src/server.ts` (`credentialSalt`), not defaulted here --
  // unlike `roleBackfill`/`sequences`, there's no safe non-secret default to
  // fall back to, so every caller (including every test builder) must supply
  // one explicitly.
  secretHasher: SecretHasher
  logger?: boolean
  // Story 007's internal-JWT verification key -- keep has no Host to
  // resolve a tenant from itself (one shared deployment for every tenant,
  // ADR 0089), so this defaults to `perTenantJwksKeyProvider(resolveTenantDomain)`,
  // which reads the tenant hint off the token's own protected header and
  // looks up that tenant's own registered domain (tenants bring their own,
  // unrelated domains -- there's no formula from slug to host). Tests
  // override with a `staticKeyProvider` fixture pinned to a
  // locally-generated keypair, so they never make a real JWKS fetch.
  resolveTenantDomain?: (tenantSlug: string) => string | undefined | Promise<string | undefined>
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
  app.decorate('roleBackfill', options.roleBackfill ?? createNoopRoleReferenceBackfill())
  app.decorate('entitlements', options.entitlements)
  app.decorate('sequences', options.sequences ?? createInMemorySequenceProvider())
  app.decorate('secretHasher', options.secretHasher)

  const authstarGetKey = options.authstarGetKey
    ?? perTenantJwksKeyProvider(options.resolveTenantDomain ?? (() => undefined))
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
  await app.register(registerPortalSessionRoutes)
  await app.register(registerBillingReadRoutes)
  await app.register(registerWebhookRoutes)
  await app.register(registerTrialRoutes)
  await app.register(registerCouponRoutes)
  await app.register(registerUsageRoutes)
  await app.register(registerStripeConfigRoutes)
  await app.register(registerMeRoutes)

  return app
}
