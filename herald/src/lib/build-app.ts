import Fastify, { type FastifyInstance } from 'fastify'
import { authstarFastifyPlugin, perTenantJwksKeyProvider, type JWTVerifyGetKey } from '@bytepunx/authstar-fastify'
import type { ConsequentApi } from './consequent-types.js'
import { PayloadKeyring } from './payload-crypto.js'
import { UnsubscribeKeyring } from './unsubscribe-token.js'
import { CredentialStore } from './credential-store.js'
import type { SendAdapter } from './send-worker.js'
import type { SignetAdmin } from './signet-admin.js'
import { createNoopSignetAdmin } from './signet-admin.js'
import registerCommunicationTypeRoutes from '../routes/communication-types.js'
import registerTemplateRoutes from '../routes/templates.js'
import registerCommunicationRoutes from '../routes/communications.js'
import registerOptOutRoutes from '../routes/opt-outs.js'
import registerSuppressionRoutes from '../routes/suppressions.js'
import registerSendingConfigRoutes from '../routes/sending-config.js'
import registerUnsubscribeRoutes from '../routes/unsubscribe.js'
import registerOperatorRotateKeysRoutes from '../routes/operator-rotate-keys.js'

export interface BuildAppOptions {
  consequent: ConsequentApi
  payloadKeyring?: PayloadKeyring
  unsubscribeKeyring?: UnsubscribeKeyring
  credentialStore?: CredentialStore
  // Defaults to an adapter that always fails closed -- a test/behavior app
  // that never configures one shouldn't silently pretend to send email.
  adapterFor?: (provider: string) => SendAdapter
  logger?: boolean
  // Story 006's internal-JWT verification key -- herald has no Host to
  // resolve a tenant from itself (one shared deployment for every tenant,
  // ADR 0089), so this defaults to `perTenantJwksKeyProvider(resolveTenantDomain)`,
  // which reads the tenant hint off the token's own protected header and
  // looks up that tenant's own registered domain (tenants bring their own,
  // unrelated domains -- there's no formula from slug to host). Tests
  // override with a `staticKeyProvider` fixture pinned to a
  // locally-generated keypair, so they never make a real JWKS fetch.
  resolveTenantDomain?: (tenantSlug: string) => string | undefined | Promise<string | undefined>
  authstarGetKey?: JWTVerifyGetKey
  // ADR 0081's key-rotation route needs both of these -- signetAdmin to
  // actually push rotated key material, operatorToken to gate the route
  // the same way every other operator route in this system is gated
  // (ADR 0021/0045). Both default to inert stand-ins so every existing
  // test/behavior app keeps working unchanged.
  signetAdmin?: SignetAdmin
  operatorToken?: string
}

const failClosedAdapter: SendAdapter = {
  send: () => Promise.resolve({ success: false, error: { message: 'no send adapter configured', transient: false } }),
}

// A single place to assemble the fastify instance so behavior/e2e/integration
// tests (and the real server entrypoint) all build the app the same way,
// differing only in which `consequent` instance (in-memory vs. Postgres-
// backed) and which send adapter they hand in.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's own default AJV options set `removeAdditional: true` -- an
    // `additionalProperties: false` schema silently *strips* an unknown
    // field instead of rejecting the request (confirmed against
    // @fastify/ajv-compiler's defaults during tower's own pilot). Overridden
    // globally so it means what it says everywhere in this service.
    ajv: { customOptions: { removeAdditional: false } },
  })

  const payloadKeyring = options.payloadKeyring ?? new PayloadKeyring()
  const unsubscribeKeyring = options.unsubscribeKeyring ?? new UnsubscribeKeyring()
  const credentialStore = options.credentialStore ?? new CredentialStore()
  const adapterFor = options.adapterFor ?? (() => failClosedAdapter)

  app.decorate('consequent', options.consequent)
  app.decorate('payloadKeyring', payloadKeyring)
  app.decorate('unsubscribeKeyring', unsubscribeKeyring)
  app.decorate('credentialStore', credentialStore)
  app.decorate('signetAdmin', options.signetAdmin ?? createNoopSignetAdmin())
  app.decorate('operatorToken', options.operatorToken ?? '')
  app.decorate('sendWorkerDeps', {
    consequent: options.consequent,
    payloadKeyring,
    unsubscribeKeyring,
    adapterFor,
  })

  const authstarGetKey = options.authstarGetKey
    ?? perTenantJwksKeyProvider(options.resolveTenantDomain ?? (() => undefined))
  // `required: false` -- same posture as tower's own build-app.ts:
  // `requirePermission` decides every failure mode as one generic 403, not
  // this plugin's default 401. `/unsubscribe` (routes/unsubscribe.ts) is
  // deliberately untouched by this plugin's `request.authstar` -- it's a
  // public, token-authenticated self-service flow, never a tenant-admin's
  // internal JWT.
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => authstarGetKey, required: false })

  await app.register(registerCommunicationTypeRoutes)
  await app.register(registerTemplateRoutes)
  await app.register(registerCommunicationRoutes)
  await app.register(registerOptOutRoutes)
  await app.register(registerSuppressionRoutes)
  await app.register(registerSendingConfigRoutes)
  await app.register(registerUnsubscribeRoutes)
  await app.register(registerOperatorRotateKeysRoutes)

  return app
}
