import Fastify, { type FastifyInstance } from 'fastify'
import { authstarFastifyPlugin, perTenantJwksKeyProvider, type JWTVerifyGetKey } from '@bytepunx/authstar-fastify'
import type { ConsequentApi } from './consequent-types.js'
import type { ContactStore } from './contact-store.js'
import { createInMemoryContactStore } from './contact-store.js'
import type { SignetAdmin } from './signet-admin.js'
import { createNoopSignetAdmin } from './signet-admin.js'
import type { Publisher } from './publisher.js'
import { createNoopPublisher } from './publisher.js'
import type { IdGenerator } from './ids.js'
import { createIdGenerator } from './ids.js'
import type { HeraldPayloadKey } from './herald-payload-crypto.js'
import { createEphemeralHeraldKey } from './herald-payload-crypto.js'
import type { ProvisioningConfig } from '../routes/provisioning.js'
import registerTenantRoutes from '../routes/tenants.js'
import registerProvisioningRoutes from '../routes/provisioning.js'
import registerEnrichRoutes from '../routes/enrich.js'
import registerIdentitiesRoutes from '../routes/identities.js'
import registerContactsRoutes from '../routes/contacts.js'
import registerErasureRequestsRoutes from '../routes/erasure-requests.js'
import registerRotateKeysRoutes from '../routes/rotate-keys.js'
import registerAccountRoutes from '../routes/accounts.js'

const defaultProvisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: true,
  baseDomain: 'authstar.test',
  operatorToken: '',
  defaultProvider: { name: 'default', clientId: '', discoveryUrl: '', scope: [] },
  defaultProviderClientSecret: '',
}

export interface BuildAppOptions {
  consequent: ConsequentApi
  logger?: boolean
  // All of the following are optional and default to in-memory/no-op
  // implementations -- existing callers (`buildApp({ consequent })`,
  // every pre-existing spec file) keep working unchanged. `src/server.ts`
  // supplies real ones.
  contactStore?: ContactStore
  signetAdmin?: SignetAdmin
  publisher?: Publisher
  ids?: IdGenerator
  provisioningConfig?: ProvisioningConfig
  // Herald's *public* payload-encryption key (ADR 0025) -- real deployment
  // sources this from signet (see herald-payload-crypto.ts's header
  // comment for why that wiring doesn't exist yet); defaults to a
  // throwaway ephemeral key so every existing test keeps working, since
  // nothing decrypts it in this pilot slice's own test tiers.
  heraldPayloadKey?: HeraldPayloadKey
  // Story 014's internal-JWT verification key. Defaults to
  // `perTenantJwksKeyProvider(provisioningConfig.baseDomain)` -- the real,
  // ADR-0089-driven resolution `src/server.ts` also gets by not overriding
  // this -- since tower has no Host to resolve a tenant from itself. Tests
  // override with a `staticKeyProvider` fixture (spec/lib/internal-jwt.ts)
  // pinned to a locally-generated key, so they never make a real JWKS
  // fetch.
  authstarGetKey?: JWTVerifyGetKey
}

// A single place to assemble the fastify instance so behavior/e2e/integration
// tests (and the real server entrypoint) all build the app the same way,
// differing only in which `consequent` instance (in-memory vs. Postgres-backed)
// and which of the above dependencies they hand in.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's own default AJV options set `removeAdditional: true` --
    // an unknown request-body field is silently stripped, not rejected,
    // even where a route schema declares `additionalProperties: false`
    // (confirmed directly against @fastify/ajv-compiler's defaults, not
    // assumed). That's a footgun for a well-specified API surface: a
    // caller sending a field this design deliberately never accepts
    // (`cookie.httpOnly`, ADR 0062) gets no signal anything was ignored.
    // Overridden globally so `additionalProperties: false` means what it
    // says everywhere in this service, not just for this one route.
    ajv: { customOptions: { removeAdditional: false } },
  })
  app.decorate('consequent', options.consequent)
  app.decorate('contactStore', options.contactStore ?? createInMemoryContactStore())
  app.decorate('signetAdmin', options.signetAdmin ?? createNoopSignetAdmin())
  app.decorate('publisher', options.publisher ?? createNoopPublisher())
  app.decorate('ids', options.ids ?? createIdGenerator())
  const provisioningConfig = options.provisioningConfig ?? defaultProvisioningConfig
  app.decorate('provisioningConfig', provisioningConfig)
  app.decorate('heraldPayloadKey', options.heraldPayloadKey ?? createEphemeralHeraldKey())

  const authstarGetKey = options.authstarGetKey ?? perTenantJwksKeyProvider(provisioningConfig.baseDomain)
  // `required: false` -- Story 014's own posture is a uniform 403 from
  // `requirePermission` for every failure mode (missing/invalid/degraded
  // token, wrong grant alike), not this plugin's default 401. Routes with
  // no `requirePermission` preHandler (enrich/identities/resolve, gated by
  // SPIFFE mTLS alone) are simply never touched by `request.authstar` at
  // all.
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => authstarGetKey, required: false })

  await app.register(registerTenantRoutes)
  await app.register(registerProvisioningRoutes)
  await app.register(registerEnrichRoutes)
  await app.register(registerIdentitiesRoutes)
  await app.register(registerContactsRoutes)
  await app.register(registerErasureRequestsRoutes)
  await app.register(registerRotateKeysRoutes)
  await app.register(registerAccountRoutes)
  return app
}
