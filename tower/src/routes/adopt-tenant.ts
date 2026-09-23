import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import { isOperatorRequest } from '../lib/operator-auth.js'
import { fetchState, validateDomain, domainAlreadyTaken, RESERVED_WORD, SLUG_PATTERN } from '../lib/tenant-validation.js'

// ADR 0094: registers a tenant in tower's own actor store for a tenant that
// already has a real, live, correct portcullis config -- e.g. `bytepunx`,
// hand-authored directly into cluster-secrets during the pre-tower DNS
// cutover (bytepunx/authstar-tower#3's own blocker comment). Unlike
// `routes/provisioning.ts`'s `POST /tenants`, this command MUST NEVER call
// `app.signetAdmin.pushSecret` or `patchConfig` -- the whole reason it
// exists is that portcullis's config and this tenant's signing keys are
// already correct and already serving real traffic. Provisioning's own
// `jsonPatchAdd('/tenants/<slug>', {...})` is RFC 6902 upsert-on-existing-
// key -- calling it here would silently replace the entire hand-authored
// tenant object (wiping every application portcullis doesn't yet have a
// tower-side record for, and rotating away the live session/internal
// signing keys out from under every already-authenticated session).
//
// Operator-only, no self-service path -- adoption is a one-time migration
// action, not something a tenant admin ever triggers themselves.
export interface AdoptTenantConfig {
  operatorToken: string
}

const adoptParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const adoptBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'domain', 'cookieDomain', 'adminEmail', 'provider'],
  properties: {
    name: { type: 'string', minLength: 1 },
    domain: { type: 'string', minLength: 1, maxLength: 255 },
    // Not always equal to `domain` -- bytepunx's own live cookie domain is
    // the flat, dot-prefixed ".bytepunx.com" (shared SSO across every
    // subdomain), distinct from the tenant's own bare "bytepunx.com".
    cookieDomain: { type: 'string', minLength: 1 },
    adminEmail: { type: 'string', minLength: 3 },
    provider: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'clientId', 'discoveryUrl', 'scope'],
      properties: {
        name: { type: 'string', minLength: 1 },
        clientId: { type: 'string', minLength: 1 },
        discoveryUrl: { type: 'string', minLength: 1 },
        scope: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const

interface AdoptTenantBody {
  name: string
  domain: string
  cookieDomain: string
  adminEmail: string
  provider: { name: string, clientId: string, discoveryUrl: string, scope: string[] }
}

const adoptTenantRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/operator/tenants/:tenantSlug/adopt',
    { schema: { params: adoptParamsSchema, body: adoptBodySchema } },
    async (request, reply) => {
      if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
        return reply.code(403).send({ error: 'operator bearer token required' })
      }

      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as AdoptTenantBody

      if (!SLUG_PATTERN.test(tenantSlug)) {
        return reply.code(400).send({ error: 'slug must match ^[a-z0-9-]+$' })
      }
      if (tenantSlug === RESERVED_WORD) {
        return reply.code(400).send({ error: `"${RESERVED_WORD}" is a reserved slug` })
      }

      const validatedDomain = validateDomain(body.domain)
      if (typeof validatedDomain !== 'string') return reply.code(400).send(validatedDomain)

      const existing = await fetchState<TenantState>(app, 'tenant', tenantSlug)
      if (existing?.createdAt) {
        return reply.code(409).send({ error: `tenant "${tenantSlug}" is already registered in tower` })
      }
      if (await domainAlreadyTaken(app, validatedDomain, tenantSlug)) {
        return reply.code(409).send({ error: `domain "${validatedDomain}" is already registered to another tenant` })
      }

      // Same PII-isolated contactId resolution provisioning.ts's own
      // `POST /tenants` uses -- never store the raw email on the tenant
      // actor.
      const contact = await app.contactStore.upsert(tenantSlug, body.adminEmail)

      await app.consequent.handle(tenantSlug, 'tenant.create', {
        slug: tenantSlug,
        name: body.name,
        domain: validatedDomain,
        cookieDomain: body.cookieDomain,
        adminContactId: contact.id,
        createdBy: 'operator-adopt',
      })
      // Flags flip true with no signet writes -- these mean exactly what
      // they say for an adopted tenant: the secrets and portcullis config
      // already exist, just not because tower itself pushed them.
      await app.consequent.handle(tenantSlug, 'tenant.mark-secrets-provisioned', {})
      await app.consequent.handle(tenantSlug, 'tenant.mark-portcullis-registered', {})

      const providerKey = `${tenantSlug}:${body.provider.name}`
      const existingProvider = await fetchState<ProviderState>(app, 'provider', providerKey)
      if (!existingProvider?.createdAt) {
        await app.consequent.handle(providerKey, 'provider.create', {
          tenant: tenantSlug,
          name: body.provider.name,
          clientId: body.provider.clientId,
          discoveryUrl: body.provider.discoveryUrl,
          scope: body.provider.scope,
        })
        try {
          await app.consequent.handle(tenantSlug, 'tenant.add-provider', { name: body.provider.name })
        } catch {
          // Best-effort convenience mirror onto tenant's own embedded array,
          // same as provisioning.ts's own equivalent step -- never blocks.
        }
      }

      const tenant = (await fetchState<TenantState>(app, 'tenant', tenantSlug))!
      return reply.code(201).send({ slug: tenantSlug, domain: tenant.domain })
    },
  )
}

export default adoptTenantRoutes
