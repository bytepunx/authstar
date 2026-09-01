import { describe, expect, it } from 'vitest'
import { decodeBundleSecrets, resolveConfigFromBundle } from '../../src/lib/signet-bundle-config.js'
import { DEV_ONLY_INTERNAL_JWT_SECRET } from '../../src/lib/config.js'

// ADR 0102 / Story 003: once chronicle is in Signet-Configured Mode, every
// non-bootstrap setting is sourced exclusively from the fetched bundle --
// no env fallback, no hardcoded literal default -- and a bundle missing a
// field the service expects is a startup failure naming that exact field.

const validBundle: Record<string, unknown> = {
  clickhouseUrl: 'https://ch.internal:8443',
  clickhouseUsername: 'chronicle',
  clickhouseDatabase: 'chronicle',
  rabbitmqUrl: 'amqp://broker.internal:5672',
  retentionMonths: 24,
  maxDateRangeDays: 92,
  queryTimeoutMs: 10_000,
  rateLimitMax: 60,
  rateLimitWindowMs: 60_000,
}

const validSecrets: Record<string, string> = {
  clickhousePassword: 'ch-secret',
  internalJwtSecret: 'signet-sourced-jwt-secret',
}

describe('decodeBundleSecrets', () => {
  it('base64-decodes every secret in bundle.secrets', () => {
    const bundle = { secrets: { foo: Buffer.from('bar').toString('base64') } }
    expect(decodeBundleSecrets(bundle)).toEqual({ foo: 'bar' })
  })

  it('returns an empty object when bundle.secrets is absent', () => {
    expect(decodeBundleSecrets({})).toEqual({})
    expect(decodeBundleSecrets(undefined)).toEqual({})
  })
})

describe('resolveConfigFromBundle', () => {
  it('sources the full config from the bundle/secrets when everything is present', () => {
    const config = resolveConfigFromBundle(validBundle, validSecrets)

    expect(config).toEqual({
      clickhouse: {
        url: 'https://ch.internal:8443',
        username: 'chronicle',
        password: 'ch-secret',
        database: 'chronicle',
      },
      rabbitmq: { url: 'amqp://broker.internal:5672' },
      retentionMonths: 24,
      internalJwtSecret: 'signet-sourced-jwt-secret',
      reporting: {
        maxDateRangeDays: 92,
        queryTimeoutMs: 10_000,
        rateLimit: { max: 60, windowMs: 60_000 },
      },
    })
  })

  it('falls back from bundle.rabbitmqUrl to secrets.rabbitmqUrl when the bundle field is absent', () => {
    const { rabbitmqUrl: _drop, ...bundleWithoutRabbitUrl } = validBundle
    const config = resolveConfigFromBundle(bundleWithoutRabbitUrl, { ...validSecrets, rabbitmqUrl: 'amqp://from-secret:5672' })
    expect(config.rabbitmq.url).toBe('amqp://from-secret:5672')
  })

  it('the dev JWT secret literal is unreachable -- omitting secrets.internalJwtSecret throws rather than defaulting to it', () => {
    const { internalJwtSecret: _drop, ...secretsWithoutJwt } = validSecrets
    expect(() => resolveConfigFromBundle(validBundle, secretsWithoutJwt)).toThrow(/internalJwtSecret/)

    // And even on success, the dev literal never appears anywhere in the
    // resolved config -- proving there is no code path in this module that
    // could substitute it.
    const config = resolveConfigFromBundle(validBundle, validSecrets)
    expect(config.internalJwtSecret).not.toBe(DEV_ONLY_INTERNAL_JWT_SECRET)
    expect(JSON.stringify(config)).not.toContain(DEV_ONLY_INTERNAL_JWT_SECRET)
  })

  it.each([
    ['clickhouseUrl', 'clickhouseUrl'],
    ['clickhouseUsername', 'clickhouseUsername'],
    ['clickhouseDatabase', 'clickhouseDatabase'],
    ['retentionMonths', 'retentionMonths'],
    ['maxDateRangeDays', 'maxDateRangeDays'],
    ['queryTimeoutMs', 'queryTimeoutMs'],
    ['rateLimitMax', 'rateLimitMax'],
    ['rateLimitWindowMs', 'rateLimitWindowMs'],
  ])('throws naming "%s" when that bundle field is missing', (fieldToDrop, expectedName) => {
    const incompleteBundle = { ...validBundle }
    delete incompleteBundle[fieldToDrop]
    expect(() => resolveConfigFromBundle(incompleteBundle, validSecrets)).toThrow(new RegExp(expectedName))
  })

  it('throws naming "clickhousePassword secret" when that secret is missing', () => {
    const { clickhousePassword: _drop, ...secretsWithoutPassword } = validSecrets
    expect(() => resolveConfigFromBundle(validBundle, secretsWithoutPassword)).toThrow(/clickhousePassword secret/)
  })

  it('throws naming "rabbitmqUrl secret" when neither bundle.rabbitmqUrl nor secrets.rabbitmqUrl is present', () => {
    const { rabbitmqUrl: _drop, ...bundleWithoutRabbitUrl } = validBundle
    expect(() => resolveConfigFromBundle(bundleWithoutRabbitUrl, validSecrets)).toThrow(/rabbitmqUrl secret/)
  })

  it('rejects an empty-string bundle field as missing, not as a valid empty value', () => {
    expect(() => resolveConfigFromBundle({ ...validBundle, clickhouseUrl: '' }, validSecrets)).toThrow(/clickhouseUrl/)
  })

  it('rejects a non-numeric bundle field as missing', () => {
    expect(() => resolveConfigFromBundle({ ...validBundle, retentionMonths: 'not-a-number' }, validSecrets)).toThrow(/retentionMonths/)
  })

  it('accepts a numeric bundle field encoded as a numeric string', () => {
    const config = resolveConfigFromBundle({ ...validBundle, retentionMonths: '18' }, validSecrets)
    expect(config.retentionMonths).toBe(18)
  })

  it('never falls back to an env var even if one happens to be set', () => {
    const original = process.env.CHRONICLE_CLICKHOUSE_URL
    process.env.CHRONICLE_CLICKHOUSE_URL = 'https://should-be-ignored.example.test'
    try {
      const { clickhouseUrl: _drop, ...bundleWithoutUrl } = validBundle
      expect(() => resolveConfigFromBundle(bundleWithoutUrl, validSecrets)).toThrow(/clickhouseUrl/)
    } finally {
      if (original === undefined) delete process.env.CHRONICLE_CLICKHOUSE_URL
      else process.env.CHRONICLE_CLICKHOUSE_URL = original
    }
  })
})
