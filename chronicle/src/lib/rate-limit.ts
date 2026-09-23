import type { FastifyReply, FastifyRequest } from 'fastify'

export interface RateLimitOptions {
  max: number
  windowMs: number
}

// Per-tenant rate limiting on the query/export-summary endpoints -- same
// resource-protection instinct as invite quotas and lookout's own
// client-facing path (Story 002 / ADR 0036). A simple in-memory fixed
// window is sufficient for a single-instance pilot; a multi-replica
// deployment would need this backed by something shared (valkey/redis),
// not designed here.
export default class TenantRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>()

  constructor(private readonly options: RateLimitOptions) {}

  consume(tenant: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(tenant)
    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      this.hits.set(tenant, { count: 1, windowStart: now })
      return true
    }
    if (entry.count >= this.options.max) {
      return false
    }
    entry.count += 1
    return true
  }
}

export function rateLimitPreHandler(rateLimiter: TenantRateLimiter) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { tenantSlug } = request.params as { tenantSlug: string }
    if (!rateLimiter.consume(tenantSlug)) {
      return reply.code(429).send({ error: 'rate limit exceeded for this tenant, try again shortly' })
    }
  }
}
