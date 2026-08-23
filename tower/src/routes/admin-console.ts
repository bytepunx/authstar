import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { jsonPatchAdd } from '@bytepunx/signet-client'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import { isOperatorRequest } from '../lib/operator-auth.js'
import { fetchState } from '../lib/tenant-validation.js'
import { searchCriteria } from '../lib/consequent-types.js'
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

      // The tenant's own registered, active providers -- NOT
      // `provisioningConfig.defaultProvider` (tower's installation-wide
      // default, only relevant to *new* self-service tenants at creation
      // time). An adopted tenant like bytepunx has its own provider(s)
      // registered via `POST /operator/tenants/:slug/adopt`, which may not
      // match the installation default at all -- using the wrong name here
      // silently produces an admin console with zero working login
      // providers (portcullis's own `working_providers()` filter finds no
      // match between the application's `providers` list and the tenant's
      // actually-resolved ones).
      const providerInstances = await app.consequent.find('provider', searchCriteria({ tenant: tenantSlug, status: 'active' }))
      const providerNames = providerInstances.map((i) => (i.state as unknown as ProviderState).name)

      const existingAdminApp = await fetchState<ApplicationState>(app, 'application', adminAppKey)
      if (!existingAdminApp?.createdAt) {
        await app.consequent.handle(adminAppKey, 'application.create', {
          tenant: tenantSlug,
          slug: RESERVED_ADMIN_APPLICATION_SLUG,
          name: `${tenant.name} Admin`,
          hosts: [adminHost],
          exposedProviders: providerNames,
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
      }

      // Scoped add -- only this one application key, never `/tenants/<slug>`
      // itself. This is the entire reason this route exists instead of
      // reusing completeDomainDependentProvisioning. Always (re)sent, even
      // on a retry against an already-created tower application, so a stale
      // or wrong `providers` list self-corrects rather than requiring a
      // separate repair path.
      await app.signetAdmin.patchConfig('portcullis', [
        jsonPatchAdd(`/tenants/${tenantSlug}/applications/${RESERVED_ADMIN_APPLICATION_SLUG}`, {
          hosts: [adminHost],
          server: { publicUrl: `https://${adminHost}` },
          upstream: { base: WEB_UPSTREAM_BASE },
          auth: { loginUrl: '/oauth2/select' },
          providers: providerNames,
        }),
      ])

      return reply.code(existingAdminApp?.createdAt ? 200 : 201).send({ slug: tenantSlug, adminHost })
    },
  )
}

export default adminConsoleRoutes
