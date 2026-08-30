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
import registerAdoptTenantRoutes from '../routes/adopt-tenant.js'
import registerAdminConsoleRoutes from '../routes/admin-console.js'
import registerEnrichRoutes from '../routes/enrich.js'
import registerIdentitiesRoutes from '../routes/identities.js'
import registerContactsRoutes from '../routes/contacts.js'
import registerErasureRequestsRoutes from '../routes/erasure-requests.js'
import registerRotateKeysRoutes from '../routes/rotate-keys.js'
import registerAccountRoutes from '../routes/accounts.js'
import registerOrganizationRoutes from '../routes/organizations.js'
import registerApplicationRoutes from '../routes/applications.js'
import registerProviderRoutes from '../routes/providers.js'
import registerRoleDefinitionRoutes from '../routes/role-definitions.js'
import registerInviteRoutes from '../routes/invites.js'
import registerInviteCodeRoutes from '../routes/invite-codes.js'
import registerActivityRoutes from '../routes/activity.js'
import registerOperatorRoutes from '../routes/operator.js'
import registerApiKeyRoutes from '../routes/api-keys.js'
import registerVerifyApiKeyRoutes from '../routes/verify-api-key.js'

const defaultProvisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: true,
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
  // Story 014's internal-JWT verification key. Defaults to a
  // `perTenantJwksKeyProvider` backed by a slug -> domain lookup against
  // tower's own `tenant` actor (ADR 0091 -- tower already knows every
  // tenant's domain, no need to call itself over HTTP), cached per-process
  // since tenants are added infrequently. `src/server.ts` gets this by not
  // overriding it, since tower has no Host to resolve a tenant from
  // itself. Tests override with a `staticKeyProvider` fixture
  // (spec/lib/internal-jwt.ts) pinned to a locally-generated key, so they
  // never make a real JWKS fetch.
  authstarGetKey?: JWTVerifyGetKey
  // Real fastify-level SPIFFE mTLS for `/enrich`/`/identities/resolve`
  // (`src/lib/spiffe-mtls.ts`) -- both `tls` and `spiffeTrustDomain` must
  // be supplied together for it to engage; omitted by every existing
  // test/dev caller, which keeps building a plain-HTTP app with those two
  // routes open exactly as before this option existed. `src/server.ts` is
  // the one real caller that supplies both, via `fetchServerCredentials()`.
  tls?: { cert: string, key: string, ca: string }
  spiffeTrustDomain?: string
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
    // `requestCert: true, rejectUnauthorized: false` -- accepts a
    // connection regardless of whether a valid client certificate was
    // presented; enforcement is fastify-level (`requireSpiffePeer`,
    // applied only to `/enrich`/`/identities/resolve` in their own route
    // files), not a whole-server requirement every other JWT/operator-
    // bearer-authenticated route on this same server would otherwise need
    // to satisfy too. See `src/lib/spiffe-mtls.ts`'s own header comment.
    ...(options.tls ? { https: { ...options.tls, requestCert: true, rejectUnauthorized: false } } : {}),
  })
  app.decorate('consequent', options.consequent)
  app.decorate('contactStore', options.contactStore ?? createInMemoryContactStore())
  app.decorate('signetAdmin', options.signetAdmin ?? createNoopSignetAdmin())
  app.decorate('publisher', options.publisher ?? createNoopPublisher())
  app.decorate('ids', options.ids ?? createIdGenerator())
  const provisioningConfig = options.provisioningConfig ?? defaultProvisioningConfig
  app.decorate('provisioningConfig', provisioningConfig)
  app.decorate('heraldPayloadKey', options.heraldPayloadKey ?? createEphemeralHeraldKey())
  app.decorate('spiffeTrustDomain', options.spiffeTrustDomain)

  const domainCache = new Map<string, string>()
  const resolveTenantDomain = async (slug: string): Promise<string | undefined> => {
    if (domainCache.has(slug)) return domainCache.get(slug)
    const instance = await options.consequent.fetch('tenant', slug)
    const domain = (instance?.state as { domain?: string } | undefined)?.domain
    if (domain) domainCache.set(slug, domain)
    return domain
  }
  const authstarGetKey = options.authstarGetKey ?? perTenantJwksKeyProvider(resolveTenantDomain)
  // `required: false` -- Story 014's own posture is a uniform 403 from
  // `requirePermission` for every failure mode (missing/invalid/degraded
  // token, wrong grant alike), not this plugin's default 401. Routes with
  // no `requirePermission` preHandler (enrich/identities/resolve, gated by
  // SPIFFE mTLS alone) are simply never touched by `request.authstar` at
  // all.
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => authstarGetKey, required: false })

  await app.register(registerTenantRoutes)
  await app.register(registerProvisioningRoutes)
  await app.register(registerAdoptTenantRoutes)
  await app.register(registerAdminConsoleRoutes)
  await app.register(registerEnrichRoutes)
  await app.register(registerIdentitiesRoutes)
  await app.register(registerContactsRoutes)
  await app.register(registerErasureRequestsRoutes)
  await app.register(registerRotateKeysRoutes)
  await app.register(registerAccountRoutes)
  await app.register(registerOrganizationRoutes)
  await app.register(registerApplicationRoutes)
  await app.register(registerProviderRoutes)
  await app.register(registerRoleDefinitionRoutes)
  await app.register(registerInviteRoutes)
  await app.register(registerInviteCodeRoutes)
  await app.register(registerActivityRoutes)
  await app.register(registerOperatorRoutes)
  await app.register(registerApiKeyRoutes)
  await app.register(registerVerifyApiKeyRoutes)
  return app
}
