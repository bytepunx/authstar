import type { Publisher } from './publisher.js'
import type { RateLimiter } from './rate-limiter.js'

declare module 'fastify' {
  interface FastifyInstance {
    publisher: Publisher
    rateLimiter: RateLimiter
    clientEventAllowlist: ReadonlySet<string>
    clientPayloadMaxBytes: number
    // node-flakes' getBase62Provider() result -- one call per app instance,
    // matching the "coordination-free" id generation it's designed for
    // (tech-stack.md), not re-created per request.
    nextEventId: () => string
  }
}
