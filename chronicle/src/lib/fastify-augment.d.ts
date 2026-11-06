import type { ClickHouseApi } from './types.js'
import type { ChronicleConfig } from './config.js'
import type TenantRateLimiter from './rate-limit.js'

// `request.authstar` (the verified internal-JWT claims) is declared by
// `@bytepunx/authstar-fastify` itself.
declare module 'fastify' {
  interface FastifyInstance {
    clickhouse: ClickHouseApi
    config: ChronicleConfig
    rateLimiter: TenantRateLimiter
  }
}
