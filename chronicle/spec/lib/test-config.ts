import type { ChronicleConfig } from '../../src/lib/config.js'

export function buildTestConfig(overrides: Partial<ChronicleConfig> = {}): ChronicleConfig {
  return {
    clickhouse: { url: 'http://localhost:8123', username: 'default', password: '', database: 'chronicle' },
    rabbitmq: { url: 'amqp://localhost:5672' },
    retentionMonths: 24,
    towerBaseUrl: 'http://tower.test:8080',
    reporting: {
      maxDateRangeDays: 92,
      queryTimeoutMs: 10_000,
      rateLimit: { max: 60, windowMs: 60_000 },
    },
    ...overrides,
  }
}
