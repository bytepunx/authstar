// Chronicle's own signet bundle (ADR 0004's pattern, ADR 0036) holds
// `retentionMonths` plus ClickHouse and RabbitMQ connection details, and (per
// this same auth model as herald, ADR 0034) the key material chronicle uses
// to independently verify the portcullis-forwarded internal JWT.
//
// A real signet client isn't wired up in this pilot slice -- same posture
// tower's own pilot took (see tower's `TESTING.md`/`build-app.ts`): the
// *shape* of config this service needs is settled here, sourced from env
// vars for local dev/testing, with `GetServiceBundle` swapped in for the
// `fromEnv()` call below once signet integration is built for real.

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
  // (ADR 0034's auth model, applied to chronicle here). HS256 for this
  // pilot slice -- a real deployment sources this (and any asymmetric key
  // material) from signet as a secret, not an env var.
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

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function loadConfig(): ChronicleConfig {
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
    internalJwtSecret: process.env.CHRONICLE_INTERNAL_JWT_SECRET ?? 'dev-only-insecure-secret',
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
