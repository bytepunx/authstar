import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { jsonPatchAdd } from '@bytepunx/signet-client'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import { isOperatorRequest } from '../lib/operator-auth.js'
import { fetchState } from '../lib/tenant-validation.js'
import { RESERVED_ADMIN_APPLICATION_SLUG, WEB_UPSTREAM_BASE } from './provisioning.js'

// ADR 0096: completes the `_admin` console for a tenant adopted via
// `POST /operator/tenants/:tenantSlug/adopt` (ADR 0094), which deliberately
// never creates it -- adoption exists specifically to avoid touching
// portcullis's already-correct hand-authored config, and the whole-tenant
// `jsonPatchAdd('/tenants/<slug>', {...})` `completeDomainDependentProvisioning`
// uses for a *new* tenant would replace that config wholesale, wiping every
// other hand-authored application (bytepunx/authstar-tower#3's own
// motivating case: argo/loci/fabledrifter/writingdesk).
//
// This route is the safe alternative: it patches portcullis with an
// **additive, scoped** add at `/tenants/<slug>/applications/_admin` only --
// never the whole-tenant object -- so an adopted tenant can still get a real
// admin console (and therefore redeemable admin invites) without any risk
// to its existing applications. Not needed for a tenant provisioned the
// normal way (`POST /tenants`), which already gets `_admin` for free.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const adminConsoleRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/operator/tenants/:tenantSlug/admin-console',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
        return reply.code(403).send({ error: 'operator bearer token required' })
      }

      const { tenantSlug } = request.params as { tenantSlug: string }
      const tenant = await fetchState<TenantState>(app, 'tenant', tenantSlug)
      if (!tenant?.createdAt) return reply.code(404).send()
      if (!tenant.domain) {
        return reply.code(409).send({ error: `tenant "${tenantSlug}" has no domain yet -- set one first` })
      }

      const adminHost = `authstar.${tenant.domain}`
      const adminAppKey = `${tenantSlug}:${RESERVED_ADMIN_APPLICATION_SLUG}`

      const existingAdminApp = await fetchState<ApplicationState>(app, 'application', adminAppKey)
      if (existingAdminApp?.createdAt) {
        return reply.code(200).send({ slug: tenantSlug, adminHost })
      }

      await app.consequent.handle(adminAppKey, 'application.create', {
        tenant: tenantSlug,
        slug: RESERVED_ADMIN_APPLICATION_SLUG,
        name: `${tenant.name} Admin`,
        hosts: [adminHost],
        exposedProviders: [app.provisioningConfig.defaultProvider.name],
      })
      try {
        await app.consequent.handle(tenantSlug, 'tenant.add-application', {
          slug: RESERVED_ADMIN_APPLICATION_SLUG,
          name: `${tenant.name} Admin`,
        })
      } catch {
        // Best-effort convenience mirror onto tenant's own embedded array --
        // never blocks, same as provisioning.ts's own equivalent step.
      }

      // Scoped add -- only this one application key, never `/tenants/<slug>`
      // itself. This is the entire reason this route exists instead of
      // reusing completeDomainDependentProvisioning.
      await app.signetAdmin.patchConfig('portcullis', [
        jsonPatchAdd(`/tenants/${tenantSlug}/applications/${RESERVED_ADMIN_APPLICATION_SLUG}`, {
          hosts: [adminHost],
          server: { publicUrl: `https://${adminHost}` },
          upstream: { base: WEB_UPSTREAM_BASE },
          auth: { loginUrl: '/oauth2/select' },
          providers: [app.provisioningConfig.defaultProvider.name],
        }),
      ])

      return reply.code(201).send({ slug: tenantSlug, adminHost })
    },
  )
}

export default adminConsoleRoutes
