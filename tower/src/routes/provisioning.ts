import { createHash, randomBytes, generateKeyPairSync } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import type { InviteState } from '../actors/invite_actor.js'
import { encryptForHerald, serializeEnvelope } from '../lib/herald-payload-crypto.js'

// Per design/stories/tower/012-tenant-creation-and-provisioning.md and ADR
// 0067 -- the full provisioning sequence: validate slug -> create `tenant`
// -> seed default provider -> auto-create `_admin` application -> push four
// signet secrets -> issue first-admin invite -> publish
// `comms.transactional.invite-sent`.
//
// Posture: tower's own direct ingress, *not* behind portcullis (no tenant
// to resolve a `Host` from pre-tenant) -- either an operator bearer token
// (always allowed) or fully unauthenticated (only if
// `provisioning.selfServiceEnabled` is true). This pilot slice checks a
// single shared operator token header rather than building the full
// bearer-token/operator-route-tree auth middleware Story 013 describes --
// see TESTING.md's scope note.
//
// Idempotency: no cross-step rollback exists (consequent has no
// multi-actor transaction primitive) -- "retry-same-request is the
// recovery model" per ADR 0067. Every step below is check-then-act
// (fetch first, skip if already done) so a retried request for an
// already-(partially-)provisioned slug converges rather than erroring or
// duplicating side effects.

export interface ProvisioningConfig {
  selfServiceEnabled: boolean
  baseDomain: string
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
    adminEmail: { type: 'string', minLength: 3 },
    adminHost: { type: 'string' },
  },
} as const

interface CreateTenantBody {
  slug: string
  name: string
  adminEmail: string
  adminHost?: string
}

// Opaque secret bytes -- correct for identity-hash-key (an HMAC-SHA256 key,
// any byte string works, see portcullis's identity_hash.rs) and
// contact-hash-pepper (tower's own, never parsed by anyone else as a key
// of any particular shape).
function randomSecret(): string {
  return randomBytes(32).toString('base64url')
}

// A PEM-encoded P-256 (secp256r1/prime256v1) EC private key, PKCS8 shape --
// required for session-key and internal-key specifically. Portcullis's
// `EcKeyPair::from_pem_bytes` (authstar-middleware/src/keys.rs) parses
// these with `jsonwebtoken`'s ES256 `EncodingKey::from_ec_pem`, which
// needs real EC key material, not opaque random bytes -- confirmed by
// reading portcullis's own source, not assumed. Using `randomSecret()`
// here instead would silently break every ES256-signed session/internal
// JWT for the tenant the moment a real portcullis instance tried to load
// it, found only by cross-checking against portcullis's real code, not
// caught by either service's own single-service test suite.
function randomEcPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return privateKey as unknown as string
}

async function fetchState<T>(app: FastifyInstance, type: string, id: string): Promise<T | null> {
  const instance = await app.consequent.fetch(type, id)
  return (instance?.state as unknown as T) ?? null
}

const provisioningRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants', { schema: { body: createTenantBodySchema } }, async (request, reply) => {
    const body = request.body as CreateTenantBody
    const config = app.provisioningConfig

    const isOperator = Boolean(config.operatorToken) && request.headers['x-operator-token'] === config.operatorToken
    if (!isOperator && !config.selfServiceEnabled) {
      return reply.code(403).send({ error: 'tenant self-service provisioning is disabled' })
    }

    if (!SLUG_PATTERN.test(body.slug)) {
      return reply.code(400).send({ error: 'slug must match ^[a-z0-9-]+$' })
    }

    const adminHost = isOperator && body.adminHost ? body.adminHost : `admin.${body.slug}.${config.baseDomain}`

    // Step 1: create tenant (or reuse an already-created one -- retry safe).
    let tenant = await fetchState<TenantState>(app, 'tenant', body.slug)
    if (!tenant?.createdAt) {
      const cookieDomain = `${body.slug}.${config.baseDomain}`
      await app.consequent.handle(body.slug, 'tenant.create', {
        slug: body.slug,
        name: body.name,
        cookieDomain,
        createdBy: isOperator ? 'operator' : 'self-service',
      })
      tenant = await fetchState<TenantState>(app, 'tenant', body.slug)
    }

    // Step 2: seed the default provider from installation config.
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
        // Best-effort convenience mirror onto tenant's own embedded array --
        // never blocks provisioning (see tenant_actor.ts's header comment).
      }
    }

    // Step 3: auto-create the `_admin` application -- the one caller in the
    // whole design permitted to use this reserved slug.
    const adminAppKey = `${body.slug}:_admin`
    let adminApp = await fetchState<ApplicationState>(app, 'application', adminAppKey)
    if (!adminApp?.createdAt) {
      await app.consequent.handle(adminAppKey, 'application.create', {
        tenant: body.slug,
        slug: '_admin',
        name: `${body.name} Admin`,
        hosts: [adminHost],
        exposedProviders: [config.defaultProvider.name],
      })
      try {
        await app.consequent.handle(body.slug, 'tenant.add-application', { slug: '_admin', name: `${body.name} Admin` })
      } catch {
        // Best-effort, see above.
      }
    }

    // Step 4: generate + push the four per-tenant secrets, once. Session
    // and internal keys are real EC private keys (portcullis's ES256 JWT
    // signing needs actual key material); identity-hash-key and
    // contact-hash-pepper are opaque HMAC-style secrets.
    if (!tenant?.secretsProvisioned) {
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-session-key`, randomEcPrivateKeyPem())
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-internal-key`, randomEcPrivateKeyPem())
      await app.signetAdmin.pushSecret('portcullis', `tenant-${body.slug}-identity-hash-key-1`, randomSecret())
      await app.signetAdmin.pushSecret('tower', `tenant-${body.slug}-contact-hash-pepper`, randomSecret())
      await app.consequent.handle(body.slug, 'tenant.mark-secrets-provisioned', {})
    }

    // Step 5: issue the first-admin invite -- Story 007's ordinary invite
    // creation logic, reused internally (ADR 0021's "no second bootstrap
    // path invented"). Token is deterministic (tenant+adminEmail) so a
    // retry converges on the same invite instead of minting a new one.
    const contact = await app.contactStore.upsert(body.slug, body.adminEmail)
    // Truncated to 40 hex chars (20 bytes) -- same `character(42)`
    // `consequent-postgres` id-map constraint `contact-store.ts`'s
    // `computeContactId` documents; `invite` is `identifiedBy: 'token'`.
    const token = createHash('sha256').update(`${body.slug}:${body.adminEmail}:admin-invite`).digest('hex').slice(0, 40)
    let invite = await fetchState<InviteState>(app, 'invite', token)
    if (!invite?.createdAt) {
      await app.consequent.handle(token, 'invite.create', {
        tenant: body.slug,
        application: null,
        contactId: contact.id,
        roles: [],
        permissions: FULL_TENANT_PERMISSIONS,
        expiresAt: null,
      })
      invite = await fetchState<InviteState>(app, 'invite', token)
    }

    // Step 6: publish for herald to send -- redelivery-safe by construction
    // (herald keys its `communication` actor by `idempotencyKey`). Shape
    // matches herald's real `IngestMessage` contract (ADR 0025's amended,
    // encrypted payload envelope) exactly -- confirmed against herald's own
    // `src/lib/ingest.ts`, not assumed from ADR prose alone. `templateData`
    // (tenantName/token/adminHost) is encrypted with herald's public key
    // before it ever goes on the wire; nothing but herald can read it.
    //
    // Two gaps this doesn't close, flagged rather than silently assumed
    // away: (1) `heraldPayloadKey` is a throwaway ephemeral key by default
    // (see herald-payload-crypto.ts) until real signet-based public-key
    // distribution exists -- a real deployment must inject herald's actual
    // current public key here. (2) `templateVersion: 1` assumes an
    // 'invite-sent' template already exists in herald for this tenant at
    // version 1; nothing in this provisioning flow actually creates one
    // (herald's own template-provisioning is a separate, unbuilt piece) --
    // until that exists, herald's ingest will accept this message but the
    // send itself will fail with "no template found," same failure mode
    // documented in herald's own template-lookup.ts.
    const envelope = encryptForHerald(app.heraldPayloadKey, { tenantName: body.name, token, adminHost })
    await app.publisher.publish('comms.transactional.invite-sent', {
      idempotencyKey: `invite:${token}:sent`,
      tenant: body.slug,
      application: '_admin',
      contactId: contact.id,
      category: 'transactional',
      type: 'invite-sent',
      title: `You're invited to ${body.name}`,
      templateVersion: 1,
      encryptedPayload: serializeEnvelope(envelope),
      payloadKeyVersion: envelope.keyVersion,
      channel: 'email',
    })

    return reply.code(201).send({ slug: body.slug, adminHost })
  })
}

export default provisioningRoutes
