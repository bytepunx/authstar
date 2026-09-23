// Chronicle's own signet bundle (ADR 0004's pattern, ADR 0036, formalized by
// ADR 0102 / Story 003) holds `retentionMonths` plus ClickHouse and RabbitMQ
// connection details, and (per this same auth model as herald, ADR 0034) the
// key material chronicle uses to independently verify the
// portcullis-forwarded internal JWT.
//
// Two operating modes, gated purely on whether `SIGNET_ADDR` is set (ADR
// 0102): Env-Only Mode (this file, unchanged from before this story) is what
// runs when it's absent; Signet-Configured Mode sources every non-bootstrap
// setting from the fetched bundle instead, via `resolveConfigFromBundle` in
// `signet-bundle-config.ts`, with no env fallback and a fail-loud error on
// any missing field. `server.ts`'s `main()` decides which of the two this
// module's `loadEnvConfig` vs. the sibling module's `resolveConfigFromBundle`
// gets called -- this file itself has no signet dependency at all, so it
// stays trivially testable without a signet dial.

export interface ChronicleConfig {
  clickhouse: {
    url: string
    username: string
    password: string
    database: string
  }
  rabbitmq: {
    url: string
  }
  // Read once at table-creation/migration time to build the `TTL` clause
  // (ADR 0085) -- changing it later is a schema migration, not a live
  // config reload (Story 001).
  retentionMonths: number
  // The shared verification key for the portcullis-forwarded internal JWT
  // (ADR 0034's auth model, applied to chronicle here). HS256 -- unaffected
  // by this story (see server.ts / PR description: only *where* this value
  // comes from changes, never its algorithm).
  internalJwtSecret: string
  reporting: {
    // Guardrails named in Story 002 / ADR 0036.
    maxDateRangeDays: number
    queryTimeoutMs: number
    rateLimit: {
      max: number
      windowMs: number
    }
  }
}

// The literal cluster manifests set verbatim today (ADR 0102's Context #1).
// Reachable *only* from `loadEnvConfig` (Env-Only Mode) -- never from
// `resolveConfigFromBundle`, which has no reference to this constant at all,
// so it is structurally unreachable once `SIGNET_ADDR` is set.
export const DEV_ONLY_INTERNAL_JWT_SECRET = 'dev-only-insecure-secret'

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Env-Only Mode's config loader -- today's exact behavior (ADR 0102 requires
// this mode to stay a legitimate, unchanged path for local dev), with one
// addition: a loud warning when the insecure dev JWT secret default is
// actually in use, so it's never silently running in an environment that
// forgot to set `CHRONICLE_INTERNAL_JWT_SECRET`. `warn` defaults to
// `console.warn` but is injectable so tests can assert on it without
// spying on the global console.
export function loadEnvConfig(warn: (message: string) => void = (message) => console.warn(message)): ChronicleConfig {
  const internalJwtSecret = process.env.CHRONICLE_INTERNAL_JWT_SECRET
  if (!internalJwtSecret) {
    warn(
      `chronicle: CHRONICLE_INTERNAL_JWT_SECRET is not set -- using the insecure default dev secret ` +
        `('${DEV_ONLY_INTERNAL_JWT_SECRET}'). This is only acceptable for local development. ` +
        `Set CHRONICLE_INTERNAL_JWT_SECRET directly, or set SIGNET_ADDR (and the rest of chronicle's ` +
        `signet bootstrap vars) to source it from signet instead.`,
    )
  }

  return {
    clickhouse: {
      url: process.env.CHRONICLE_CLICKHOUSE_URL ?? 'http://localhost:8123',
      username: process.env.CHRONICLE_CLICKHOUSE_USERNAME ?? 'default',
      password: process.env.CHRONICLE_CLICKHOUSE_PASSWORD ?? '',
      database: process.env.CHRONICLE_CLICKHOUSE_DATABASE ?? 'chronicle',
    },
    rabbitmq: {
      url: process.env.CHRONICLE_RABBITMQ_URL ?? 'amqp://localhost:5672',
    },
    retentionMonths: envInt('CHRONICLE_RETENTION_MONTHS', 24),
    internalJwtSecret: internalJwtSecret ?? DEV_ONLY_INTERNAL_JWT_SECRET,
    reporting: {
      maxDateRangeDays: envInt('CHRONICLE_MAX_DATE_RANGE_DAYS', 92),
      queryTimeoutMs: envInt('CHRONICLE_QUERY_TIMEOUT_MS', 10_000),
      rateLimit: {
        max: envInt('CHRONICLE_RATE_LIMIT_MAX', 60),
        windowMs: envInt('CHRONICLE_RATE_LIMIT_WINDOW_MS', 60_000),
      },
    },
  }
}
