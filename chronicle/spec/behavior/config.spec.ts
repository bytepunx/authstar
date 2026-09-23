import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEV_ONLY_INTERNAL_JWT_SECRET, loadEnvConfig } from '../../src/lib/config.js'

// ADR 0102 / Story 003: Env-Only Mode (no SIGNET_ADDR) must behave exactly
// as chronicle did before this story -- plain `process.env` reads, with the
// `dev-only-insecure-secret` literal still available as a default, now
// paired with a loud startup warning whenever it's actually used.

const CHRONICLE_ENV_VARS = [
  'CHRONICLE_CLICKHOUSE_URL',
  'CHRONICLE_CLICKHOUSE_USERNAME',
  'CHRONICLE_CLICKHOUSE_PASSWORD',
  'CHRONICLE_CLICKHOUSE_DATABASE',
  'CHRONICLE_RABBITMQ_URL',
  'CHRONICLE_RETENTION_MONTHS',
  'CHRONICLE_INTERNAL_JWT_SECRET',
  'CHRONICLE_MAX_DATE_RANGE_DAYS',
  'CHRONICLE_QUERY_TIMEOUT_MS',
  'CHRONICLE_RATE_LIMIT_MAX',
  'CHRONICLE_RATE_LIMIT_WINDOW_MS',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const name of CHRONICLE_ENV_VARS) {
    savedEnv[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of CHRONICLE_ENV_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnv[name]
  }
})

describe('loadEnvConfig (Env-Only Mode)', () => {
  it('returns the same defaults chronicle has always used when nothing is set', () => {
    const warnings: string[] = []
    const config = loadEnvConfig((message) => warnings.push(message))

    expect(config).toEqual({
      clickhouse: { url: 'http://localhost:8123', username: 'default', password: '', database: 'chronicle' },
      rabbitmq: { url: 'amqp://localhost:5672' },
      retentionMonths: 24,
      internalJwtSecret: DEV_ONLY_INTERNAL_JWT_SECRET,
      reporting: {
        maxDateRangeDays: 92,
        queryTimeoutMs: 10_000,
        rateLimit: { max: 60, windowMs: 60_000 },
      },
    })
  })

  it('warns loudly when the dev JWT secret default is actually used', () => {
    const warnings: string[] = []
    loadEnvConfig((message) => warnings.push(message))

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/CHRONICLE_INTERNAL_JWT_SECRET/)
    expect(warnings[0]).toMatch(new RegExp(DEV_ONLY_INTERNAL_JWT_SECRET))
  })

  it('does not warn when CHRONICLE_INTERNAL_JWT_SECRET is explicitly set', () => {
    process.env.CHRONICLE_INTERNAL_JWT_SECRET = 'a-real-secret'
    const warnings: string[] = []
    const config = loadEnvConfig((message) => warnings.push(message))

    expect(warnings).toHaveLength(0)
    expect(config.internalJwtSecret).toBe('a-real-secret')
  })

  it('reads every plain env var override, preserving today\'s field mapping', () => {
    process.env.CHRONICLE_CLICKHOUSE_URL = 'https://ch.example.test'
    process.env.CHRONICLE_CLICKHOUSE_USERNAME = 'chronicle-user'
    process.env.CHRONICLE_CLICKHOUSE_PASSWORD = 'ch-pass'
    process.env.CHRONICLE_CLICKHOUSE_DATABASE = 'chronicle_db'
    process.env.CHRONICLE_RABBITMQ_URL = 'amqp://broker.example.test:5672'
    process.env.CHRONICLE_RETENTION_MONTHS = '36'
    process.env.CHRONICLE_INTERNAL_JWT_SECRET = 'env-jwt-secret'
    process.env.CHRONICLE_MAX_DATE_RANGE_DAYS = '30'
    process.env.CHRONICLE_QUERY_TIMEOUT_MS = '5000'
    process.env.CHRONICLE_RATE_LIMIT_MAX = '10'
    process.env.CHRONICLE_RATE_LIMIT_WINDOW_MS = '1000'

    const config = loadEnvConfig(() => {})

    expect(config).toEqual({
      clickhouse: { url: 'https://ch.example.test', username: 'chronicle-user', password: 'ch-pass', database: 'chronicle_db' },
      rabbitmq: { url: 'amqp://broker.example.test:5672' },
      retentionMonths: 36,
      internalJwtSecret: 'env-jwt-secret',
      reporting: {
        maxDateRangeDays: 30,
        queryTimeoutMs: 5000,
        rateLimit: { max: 10, windowMs: 1000 },
      },
    })
  })

  it('falls back to the numeric default when a numeric env var is unparseable', () => {
    process.env.CHRONICLE_RETENTION_MONTHS = 'not-a-number'
    const config = loadEnvConfig(() => {})
    expect(config.retentionMonths).toBe(24)
  })
})
