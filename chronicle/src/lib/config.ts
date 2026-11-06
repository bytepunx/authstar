// Chronicle's own signet bundle (ADR 0004's pattern, ADR 0036, formalized by
// ADR 0102 / Story 003) holds `retentionMonths` plus ClickHouse and RabbitMQ
// connection details, and tower's base URL, which chronicle asks for a
// tenant's registered domain so it can fetch that tenant's JWKS and verify
// the portcullis-forwarded ES256 internal JWT (ADR 0086, ADR 0089, ADR 0091).
// There is no shared verification secret.
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
  // Tower's base URL. Chronicle calls `GET /tenants/:slug` there to resolve
  // a tenant's registered domain, then verifies the internal JWT against
  // `https://authstar.<domain>/.well-known/jwks.json` (ADR 0091). Same field
  // name as keep's and herald's bundle `towerBaseUrl`.
  towerBaseUrl: string
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

// Env-Only Mode's config loader (ADR 0102 keeps this mode a legitimate path
// for local dev): plain `process.env` reads with local defaults. No setting
// here is a secret that could fall back to an insecure literal.
export function loadEnvConfig(): ChronicleConfig {
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
    towerBaseUrl: process.env.CHRONICLE_TOWER_BASE_URL ?? 'http://localhost:8080',
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
