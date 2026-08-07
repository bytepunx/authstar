import Fastify, { type FastifyInstance } from 'fastify'
import type { ConsequentApi } from './consequent-types.js'
import registerTenantRoutes from '../routes/tenants.js'

export interface BuildAppOptions {
  consequent: ConsequentApi
  logger?: boolean
}

// A single place to assemble the fastify instance so behavior/e2e/integration
// tests (and the real server entrypoint) all build the app the same way,
// differing only in which `consequent` instance (in-memory vs. Postgres-backed)
// they hand in.
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
  await app.register(registerTenantRoutes)
  return app
}
