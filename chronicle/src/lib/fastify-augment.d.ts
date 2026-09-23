import type { ClickHouseApi } from './types.js'
import type { ChronicleConfig } from './config.js'
import type TenantRateLimiter from './rate-limit.js'
import type { AuthClaims } from './auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    clickhouse: ClickHouseApi
    config: ChronicleConfig
    rateLimiter: TenantRateLimiter
  }
  interface FastifyRequest {
    authClaims?: AuthClaims
  }
}
