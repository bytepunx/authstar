import Fastify, { type FastifyInstance } from 'fastify'
import { getBase62Provider } from 'node-flakes'
import type { Publisher } from './publisher.js'
import { type RateLimiter, createInMemoryRateLimiter } from './rate-limiter.js'
import { CLIENT_EVENT_ALLOWLIST, CLIENT_PAYLOAD_MAX_BYTES } from './event-types.js'
import registerEventRoutes from '../routes/events.js'

export interface BuildAppOptions {
  publisher: Publisher
  logger?: boolean
  rateLimiter?: RateLimiter
  clientEventAllowlist?: ReadonlySet<string>
  clientPayloadMaxBytes?: number
}

// A single place to assemble the fastify instance so behavior/e2e/
// integration tests (and the real server entrypoint) all build the app the
// same way, differing only in which `Publisher` (fake vs. real amqplib) and
// rate-limiter/allowlist config they hand in.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's own default AJV options set `removeAdditional: true` -- an
    // unknown request-body field is silently stripped, not rejected, even
    // where a route schema declares `additionalProperties: false`. That's a
    // correctness bug for an ingestion contract that must strictly reject
    // unrecognized fields (e.g. a client-asserted `ip`, which this pipeline
    // never accepts, ADR 0035) rather than silently dropping them with no
    // signal to the caller. Overridden globally so `additionalProperties:
    // false` means what it says everywhere in this service.
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.decorate('publisher', options.publisher)
  app.decorate('rateLimiter', options.rateLimiter ?? createInMemoryRateLimiter({ maxRequests: 100, windowMs: 1_000 }))
  app.decorate('clientEventAllowlist', options.clientEventAllowlist ?? CLIENT_EVENT_ALLOWLIST)
  app.decorate('clientPayloadMaxBytes', options.clientPayloadMaxBytes ?? CLIENT_PAYLOAD_MAX_BYTES)
  app.decorate('nextEventId', getBase62Provider())

  await app.register(registerEventRoutes)
  return app
}
