import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { jsonPatchAdd } from '@bytepunx/signet-client'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import type { InviteState } from '../actors/invite_actor.js'
import { encryptForHerald, serializeEnvelope } from '../lib/herald-payload-crypto.js'
import { randomEcPrivateKeyPem, randomSecret } from '../lib/tenant-keys.js'
import { isOperatorRequest } from '../lib/operator-auth.js'
import { searchCriteria } from '../lib/consequent-types.js'

// ADR 0091: the internal application slug for the reserved admin surface
// stays `_admin` (unchanged, invisible in any URL) -- only its *host*
// changes, to `authstar.<tenant.domain>`. "authstar" itself becomes a
// reserved word: no tenant or application may use it as a slug, since it's
// now also a hostname label every tenant's admin host shares.
const RESERVED_ADMIN_APPLICATION_SLUG = '_admin'
const RESERVED_WORD = 'authstar'
const WEB_UPSTREAM_BASE = 'http://web.authstar-platform.svc.cluster.local:3000'
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

// Per design/stories/tower/012-tenant-creation-and-provisioning.md, ADR 0067,
// and ADR 0091/0093 -- the full provisioning sequence: validate slug ->
// create `tenant` -> seed default provider -> push four signet secrets ->
// (if a domain is known) auto-create `_admin` application -> register with
// portcullis -> issue first-admin invite -> publish
// `comms.transactional.invite-sent`.
//
// ADR 0093: `domain` is optional at creation. When absent, the tenant is
// created in a domain-pending state -- everything above that needs a real
// hostname (the `_admin` app, portcullis registration, the invite) is
// deferred until `PATCH /tenants/:tenantSlug/domain` supplies one later.
//
// Posture: tower's own direct ingress, *not* behind portcullis (no tenant
// to resolve a `Host` from pre-tenant) -- either an operator bearer token
// (always allowed) or fully unauthenticated (only if
// `provisioning.selfServiceEnabled` is true). This pilot slice checks the
// same shared operator bearer token every other operator route checks
// (`isOperatorRequest`, ADR 0021/0045) rather than building the full
// bearer-token/operator-route-tree auth middleware Story 013 describes --
// see TESTING.md's scope note. Previously checked a bespoke `x-operator-token`
// header steward never actually sent, which meant this route silently
// rejected every real operator caller; fixed to match steward's actual
// `Authorization: Bearer` convention.
//
// Idempotency: no cross-step rollback exists (consequent has no
// multi-actor transaction primitive) -- "retry-same-request is the
// recovery model" per ADR 0067. Every step below is check-then-act
// (fetch first, skip if already done) so a retried request for an
// already-(partially-)provisioned slug converges rather than erroring or
// duplicating side effects.

export interface ProvisioningConfig {
  selfServiceEnabled: boolean
  operatorToken: string
  defaultProvider: { name: string, clientId: string, discoveryUrl: string, scope: string[] }
  defaultProviderClientSecret: string
}

// The elevated-bootstrap permission set ADR 0067's first-admin invite
// grants in full (Story 005's closed permission vocabulary) -- the same
// "manage everything in this tenant" set ADR 0021's operator-issued
// elevated invites use.
const FULL_TENANT_PERMISSIONS = [
  'roles:manage', 'permissions:manage', 'invite:send', 'invite:code:issue',
  'accounts:manage', 'applications:manage', 'providers:manage',
  'contacts:read', 'contacts:erase', 'contacts:export',
  'erasure-requests:read', 'activity:read', 'tenant:manage',
].map((grant) => ({ grant, scope: 'tenant' as const, maxOutstanding: null }))

const SLUG_PATTERN = /^[a-z0-9-]+$/

const createTenantBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'name', 'adminEmail'],
  properties: {
    slug: { type: 'string', minLength: 1, maxLength: 63 },
    name: { type: 'string', minLength: 1 },
    // ADR 0091/0093: optional -- a tenant created without one is
    // domain-pending until PATCH /tenants/:tenantSlug/domain supplies it.
    domain: { type: 'string', minLength: 1, maxLength: 255 },
    adminEmail: { type: 'string', minLength: 3 },
  },
} as const

interface CreateTenantBody {
  slug: string
  name: string
  domain?: string
  adminEmail: string
}

const setDomainBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['domain'],
  properties: {
    domain: { type: 'string', minLength: 1, maxLength: 255 },
  },
} as const

interface SetDomainBody {
  domain: string
}

async function fetchState<T>(app: FastifyInstance, type: string, id: string): Promise<T | null> {
  const instance = await app.consequent.fetch(type, id)
  return (instance?.state as unknown as T) ?? null
}

function validateDomain(rawDomain: string): string | { error: string } {
  const domain = rawDomain.toLowerCase()
  if (!DOMAIN_PATTERN.test(domain)) {
    return { error: 'domain must be a valid DNS hostname, e.g. "acme.io"' }
  }
  return domain
}

async function domainAlreadyTaken(app: FastifyInstance, domain: string, ownSlug: string): Promise<boolean> {
  // Excludes `ownSlug` so a retried request for an already-created tenant
  // with the same domain converges normally, matching this route's
  // existing check-then-act idempotency model.
  const domainHolders = await app.consequent.find('tenant', searchCriteria({ domain }))
  return domainHolders.some((i) => (i.state as unknown as TenantState).slug !== ownSlug)
}

// ADR 0091/0093: everything that needs a real hostname -- the `_admin`
// application, portcullis registration, the first-admin invite. Runs
// unconditionally once a tenant has a domain, whether that happened at
// creation (`POST /tenants` with `domain` set) or later
// (`PATCH /tenants/:tenantSlug/domain`). Idempotent, same check-then-act
// convention as the rest of this file.
async function completeDomainDependentProvisioning(
  app: FastifyInstance,
  config: ProvisioningConfig,
  tenant: TenantState,
): Promise<void> {
  const { slug, name, domain, adminContactId } = tenant
  if (!domain) throw new Error('completeDomainDependentProvisioning called without a domain')

  const adminHost = `${RESERVED_WORD}.${domain}`

  // Auto-create the `_admin` application -- the one caller in the whole
  // design permitted to use this reserved slug.
  const adminAppKey = `${slug}:_admin`
  let adminApp = await fetchState<ApplicationState>(app, 'application', adminAppKey)
  if (!adminApp?.createdAt) {
    await app.consequent.handle(adminAppKey, 'application.create', {
      tenant: slug,
      slug: '_admin',
      name: `${name} Admin`,
      hosts: [adminHost],
      exposedProviders: [config.defaultProvider.name],
    })
    try {
      await app.consequent.handle(slug, 'tenant.add-application', { slug: '_admin', name: `${name} Admin` })
    } catch {
      // Best-effort convenience mirror onto tenant's own embedded array --
      // never blocks provisioning (see tenant_actor.ts's header comment).
    }
  }

  // Register this tenant's full config with portcullis -- cookie/jwt/
  // providers/identityHashKeyGenerations/applications, in one atomic JSON
  // Patch `add` at `/tenants/<slug>`. Uses `add` (RFC 6902 upsert-on-
  // existing-key semantics) rather than per-field patches, since
  // portcullis's `cookie`/`jwt`/`applications` are all required fields --
  // any intermediate partially-populated state would fail its own
  // validation.
  if (!tenant.portcullisRegistered) {
    await app.signetAdmin.patchConfig('portcullis', [
      jsonPatchAdd(`/tenants/${slug}`, {
        status: 'active',
        cookie: {
          domain,
          path: '/',
          maxAge: 604_800,
          httpOnly: true,
          secure: true,
        },
        jwt: {
          issuer: `https://${domain}`,
          audience: slug,
          expiresIn: '168h',
        },
        identityHashKeyGenerations: [{ version: 1, effectiveFrom: new Date().toISOString() }],
        providers: {
          [config.defaultProvider.name]: {
            clientId: config.defaultProvider.clientId,
            discoveryUrl: config.defaultProvider.discoveryUrl,
            scope: config.defaultProvider.scope,
          },
        },
        applications: {
          [RESERVED_ADMIN_APPLICATION_SLUG]: {
            hosts: [adminHost],
            server: { publicUrl: `https://${adminHost}` },
            upstream: { base: WEB_UPSTREAM_BASE },
            auth: { loginUrl: '/oauth2/select' },
            providers: [config.defaultProvider.name],
          },
        },
      }),
    ])
    await app.consequent.handle(slug, 'tenant.mark-portcullis-registered', {})
  }

  // Issue the first-admin invite -- Story 007's ordinary invite creation
  // logic, reused internally (ADR 0021's "no second bootstrap path
  // invented"). Token is deterministic (tenant+contactId) so a retry
  // converges on the same invite instead of minting a new one. The publish
  // is gated by the *same* condition as the invite's own creation -- ADR
  // 0093 means this whole function can now legitimately run more than once
  // for the same tenant (a retried PATCH after the first one already
  // completed), and unlike every other step here, publishing has no
  // separate idempotency guard of its own to fall back on if this were
  // left unconditional (a real bug this file's own test suite caught: the
  // publish used to run on every call, invite already existing or not).
  const token = createInviteToken(slug, adminContactId)
  let invite = await fetchState<InviteState>(app, 'invite', token)
  if (!invite?.createdAt) {
    await app.consequent.handle(token, 'invite.create', {
      tenant: slug,
      application: null,
      contactId: adminContactId,
      roles: [],
      permissions: FULL_TENANT_PERMISSIONS,
      expiresAt: null,
    })
    invite = await fetchState<InviteState>(app, 'invite', token)

    // Publish for herald to send -- redelivery-safe by construction
    // (herald keys its `communication` actor by `idempotencyKey`, a second
    // safety net independent of the guard above). Outer envelope shape
    // matches herald's real `IngestMessage` contract (ADR 0025's amended,
    // encrypted payload envelope) exactly -- confirmed against herald's
    // own `src/lib/ingest.ts`. The *encrypted* payload itself is
    // `{ to, templateData }` -- confirmed against herald's real
    // `send-worker.ts` (`decrypted.to`/`decrypted.templateData`).
    // `templateData` nests `tenant.name` rather than a flat `tenantName`
    // to match ADR 0078's own templateData convention. `heraldPayloadKey`
    // is a throwaway ephemeral key by default (see herald-payload-crypto.ts)
    // until ADR 0081's real signet-based key-rotation route has pushed
    // herald's actual public key at least once for this installation.
    const contact = await app.contactStore.findById(adminContactId)
    if (contact) {
      const envelope = encryptForHerald(app.heraldPayloadKey, {
        to: contact.email,
        templateData: { tenant: { name }, token, adminHost },
      })
      await app.publisher.publish('comms.transactional.invite-sent', {
        idempotencyKey: `invite:${token}:sent`,
        tenant: slug,
        application: '_admin',
        contactId: adminContactId,
        category: 'transactional',
        type: 'invite-sent',
        title: `You're invited to ${name}`,
        templateVersion: 1,
        encryptedPayload: serializeEnvelope(envelope),
        payloadKeyVersion: envelope.keyVersion,
        channel: 'email',
      })
    }
    // `contact` missing (erased between invite creation and this point) is
    // not an error -- same "nothing to send" posture invites.ts's own
    // publishInviteSent already uses.
  }
}

function createInviteToken(slug: string, contactId: string): string {
  // Truncated to 40 hex chars (20 bytes) -- same `character(42)`
  // `consequent-postgres` id-map constraint `contact-store.ts`'s
  // `computeContactId` documents; `invite` is `identifiedBy: 'token'`.
  return createHash('sha256').update(`${slug}:${contactId}:admin-invite`).digest('hex').slice(0, 40)
}

const provisioningRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants', { schema: { body: createTenantBodySchema } }, async (request, reply) => {
    const body = request.body as CreateTenantBody
    const config = app.provisioningConfig

    const isOperator = isOperatorRequest(request.headers, config.operatorToken)
    if (!isOperator && !config.selfServiceEnabled) {
      return reply.code(403).send({ error: 'tenant self-service provisioning is disabled' })
    }

    if (!SLUG_PATTERN.test(body.slug)) {
      return reply.code(400).send({ error: 'slug must match ^[a-z0-9-]+$' })
    }
    if (body.slug === RESERVED_WORD) {
      return reply.code(400).send({ error: `"${RESERVED_WORD}" is a reserved slug` })
    }

    let domain: string | null = null
    if (body.domain !== undefined) {
      const validated = validateDomain(body.domain)
      if (typeof validated !== 'string') return reply.code(400).send(validated)
      domain = validated
      if (await domainAlreadyTaken(app, domain, body.slug)) {
        return reply.code(409).send({ error: `domain "${domain}" is already registered to another tenant` })
      }
    }

    // Step 1: create tenant (or reuse an already-created one -- retry safe).
    let tenant = await fetchState<TenantState>(app, 'tenant', body.slug)
    if (!tenant?.createdAt) {
      // ADR 0023: never store the raw email on the tenant actor -- resolve
      // it to a contactId (the same PII-isolated reference every other
      // actor uses) once, up front, so the domain-pending completion step
      // later doesn't need the caller to resupply it.
      const contact = await app.contactStore.upsert(body.slug, body.adminEmail)
      await app.consequent.handle(body.slug, 'tenant.create', {
        slug: body.slug,
        name: body.name,
        domain,
        cookieDomain: domain ?? '',
        adminContactId: contact.id,
        createdBy: isOperator ? 'operator' : 'self-service',
      })
      tenant = await fetchState<TenantState>(app, 'tenant', body.slug)
    }

    // Step 2: seed the default provider from installation config. Doesn't
    // need a domain -- runs regardless of provisioning state.
    const providerKey = `${body.slug}:${config.defaultProvider.name}`
    let provider = await fetchState<ProviderState>(app, 'provider', providerKey)
    if (!provider?.createdAt) {
      await app.consequent.handle(providerKey, 'provider.create', {
        tenant: body.slug,
        name: config.defaultProvider.name,
        clientId: config.defaultProvider.clientId,
        discoveryUrl: config.defaultProvider.discoveryUrl,
        scope: config.defaultProvider.scope,
      })
      await app.signetAdmin.pushSecret(
        'portcullis',
        `tenant-${body.slug}-provider-${config.defaultProvider.name}-client-secret`,
        config.defaultProviderClientSecret,
      )
      try {
        await app.consequent.handle(body.slug, 'tenant.add-provider', { name: config.defaultProvider.name })
      } catch {
        // Best-effort, see above.
      }
    }

    // Step 3: generate + push the four per-tenant secrets, once. None of
    // these are domain-derived -- session/internal keys are real EC
    // private keys (portcullis's ES256 JWT signing needs actual key
    // material); identity-hash-key and contact-hash-pepper are opaque
    // HMAC-style secrets.
    if (!tenant?.secretsProvisioned) {
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-session-key`, randomEcPrivateKeyPem())
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-internal-key`, randomEcPrivateKeyPem())
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-identity-hash-key-1`, randomSecret())
      await app.signetAdmin.pushSecret('tower', `tenant-${body.slug}-contact-hash-pepper`, randomSecret())
      await app.consequent.handle(body.slug, 'tenant.mark-secrets-provisioned', {})
    }

    // Steps 4+ (ADR 0093): everything that needs a real hostname is
    // deferred until the tenant actually has a domain -- either already
    // (a retry), or because this request supplied one.
    if (tenant!.domain) {
      await completeDomainDependentProvisioning(app, config, tenant!)
    }

    return reply.code(201).send({
      slug: body.slug,
      domain: tenant!.domain,
      adminHost: tenant!.domain ? `${RESERVED_WORD}.${tenant!.domain}` : null,
    })
  })

  // ADR 0093: completes provisioning for a domain-pending tenant. Same auth
  // gate as creation itself -- there's no ownership concept for a
  // domain-pending tenant beyond "the same credential that could have
  // created it in the first place."
  app.patch('/tenants/:tenantSlug/domain', { schema: { body: setDomainBodySchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as SetDomainBody
    const config = app.provisioningConfig

    const isOperator = isOperatorRequest(request.headers, config.operatorToken)
    if (!isOperator && !config.selfServiceEnabled) {
      return reply.code(403).send({ error: 'tenant self-service provisioning is disabled' })
    }

    const tenant = await fetchState<TenantState>(app, 'tenant', tenantSlug)
    if (!tenant?.createdAt) return reply.code(404).send()

    const validated = validateDomain(body.domain)
    if (typeof validated !== 'string') return reply.code(400).send(validated)
    const domain = validated

    if (tenant.domain && tenant.domain !== domain) {
      return reply.code(409).send({ error: `tenant "${tenantSlug}" already has a domain set` })
    }

    if (!tenant.domain) {
      if (await domainAlreadyTaken(app, domain, tenantSlug)) {
        return reply.code(409).send({ error: `domain "${domain}" is already registered to another tenant` })
      }
      const results = await app.consequent.handle(tenantSlug, 'tenant.set-domain', { domain })
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
    }

    const updated = (await fetchState<TenantState>(app, 'tenant', tenantSlug))!
    await completeDomainDependentProvisioning(app, config, updated)

    return reply.code(200).send({ slug: tenantSlug, domain, adminHost: `${RESERVED_WORD}.${domain}` })
  })
}

export default provisioningRoutes
