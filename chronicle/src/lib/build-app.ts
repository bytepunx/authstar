import Fastify, { type FastifyInstance } from 'fastify'
import { authstarFastifyPlugin, perTenantJwksKeyProvider, type JWTVerifyGetKey } from '@bytepunx/authstar-fastify'
import type { ClickHouseApi } from './types.js'
import type { ChronicleConfig } from './config.js'
import TenantRateLimiter from './rate-limit.js'
import registerAuthFunnelRoutes from '../routes/auth-funnel.js'
import registerActiveUsersRoutes from '../routes/active-users.js'
import registerQueryRoutes from '../routes/query.js'
import registerExportSummaryRoutes from '../routes/export-summary.js'

export interface BuildAppOptions {
  clickhouse: ClickHouseApi
  config: ChronicleConfig
  logger?: boolean
  // Internal-JWT verification key. Chronicle is one shared deployment for
  // every tenant, so it has no Host to resolve a tenant from (ADR 0089):
  // this defaults to `perTenantJwksKeyProvider(resolveTenantDomain)`, which
  // reads the `tenant` hint off the token's protected header and fetches
  // `https://authstar.<domain>/.well-known/jwks.json` for that tenant's
  // registered domain (ADR 0091). Tests pass a `staticKeyProvider` pinned
  // to a local keypair as `authstarGetKey`, so they never fetch JWKS.
  resolveTenantDomain?: (tenantSlug: string) => string | undefined | Promise<string | undefined>
  authstarGetKey?: JWTVerifyGetKey
}

// A single place to assemble the fastify instance so behavior/e2e/
// integration tests (and the real server entrypoint) all build the app the
// same way, differing only in which `ClickHouseApi` implementation (fake
// vs. real ClickHouse-backed) they hand in -- same pattern as tower's own
// `buildApp`.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's default AJV options set `removeAdditional: true` -- an
    // `additionalProperties: false` schema silently strips an unknown
    // field instead of rejecting the request. The constrained query
    // endpoint's `groupBy`/`filters` vocabulary (Story 002 / ADR 0036)
    // depends on unknown values actually being rejected (400), not quietly
    // dropped -- overridden globally so every schema in this service means
    // what it says.
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.decorate('clickhouse', options.clickhouse)
  app.decorate('config', options.config)
  app.decorate('rateLimiter', new TenantRateLimiter(options.config.reporting.rateLimit))

  const authstarGetKey = options.authstarGetKey
    ?? perTenantJwksKeyProvider(options.resolveTenantDomain ?? (() => undefined))
  // `required: false`: the plugin leaves `request.authstar` undefined on a
  // missing or unverifiable token, and `requirePermission` (auth.ts) turns
  // that into chronicle's 401, keeping 403 for a verified token that names
  // another tenant or lacks the permission.
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => authstarGetKey, required: false })

  await app.register(registerAuthFunnelRoutes)
  await app.register(registerActiveUsersRoutes)
  await app.register(registerQueryRoutes)
  await app.register(registerExportSummaryRoutes)

  return app
}
