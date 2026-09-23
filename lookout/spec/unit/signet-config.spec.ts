import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RABBITMQ_URL,
  isSignetConfigured,
  resolveEnvOnlyRabbitmqUrl,
  resolveSignetRabbitmqUrl,
  decodeBundleSecrets,
} from '../../src/lib/signet-config.js'

// Unit tier: pure decision logic only -- no fastify, no real signet dial,
// no real amqplib. Covers ADR 0102's mode gate (`SIGNET_ADDR` presence),
// Env-Only Mode's unchanged default/override behavior, and
// Signet-Configured Mode's precedence (`bundle.rabbitmqUrl` over decoded
// `secrets.rabbitmqUrl`) plus its fail-loud-on-missing-field requirement.

describe('isSignetConfigured', () => {
  it('is false when SIGNET_ADDR is absent (Env-Only Mode)', () => {
    expect(isSignetConfigured({})).toBe(false)
  })

  it('is true when SIGNET_ADDR is present (Signet-Configured Mode)', () => {
    expect(isSignetConfigured({ SIGNET_ADDR: 'signet.internal:8443' })).toBe(true)
  })
})

describe('resolveEnvOnlyRabbitmqUrl -- Env-Only Mode', () => {
  it('returns the default amqp://localhost when LOOKOUT_RABBITMQ_URL is unset', () => {
    expect(resolveEnvOnlyRabbitmqUrl({})).toBe(DEFAULT_RABBITMQ_URL)
  })

  it('honors LOOKOUT_RABBITMQ_URL when set', () => {
    expect(resolveEnvOnlyRabbitmqUrl({ LOOKOUT_RABBITMQ_URL: 'amqp://broker.example:5672' })).toBe(
      'amqp://broker.example:5672'
    )
  })
})

describe('decodeBundleSecrets', () => {
  it('base64-decodes every secret value', () => {
    const decoded = decodeBundleSecrets({ secrets: { rabbitmqUrl: Buffer.from('amqp://from-secret').toString('base64') } })
    expect(decoded).toEqual({ rabbitmqUrl: 'amqp://from-secret' })
  })

  it('returns an empty object when the bundle has no secrets', () => {
    expect(decodeBundleSecrets({})).toEqual({})
    expect(decodeBundleSecrets(undefined)).toEqual({})
  })
})

describe('resolveSignetRabbitmqUrl -- Signet-Configured Mode', () => {
  it('prefers bundle.rabbitmqUrl over secrets.rabbitmqUrl', () => {
    const url = resolveSignetRabbitmqUrl({ rabbitmqUrl: 'amqp://from-bundle' }, { rabbitmqUrl: 'amqp://from-secret' })
    expect(url).toBe('amqp://from-bundle')
  })

  it('falls back to decoded secrets.rabbitmqUrl when bundle.rabbitmqUrl is absent', () => {
    const url = resolveSignetRabbitmqUrl({}, { rabbitmqUrl: 'amqp://from-secret' })
    expect(url).toBe('amqp://from-secret')
  })

  it('fails loud, naming the field, when neither bundle nor secrets has it', () => {
    expect(() => resolveSignetRabbitmqUrl({}, {})).toThrow(/rabbitmqUrl/)
  })

  it('never falls back to the Env-Only default or an env var', () => {
    // No LOOKOUT_RABBITMQ_URL read anywhere in this function -- asserted
    // indirectly: an empty bundle/secrets pair throws rather than
    // returning DEFAULT_RABBITMQ_URL or anything else.
    expect(() => resolveSignetRabbitmqUrl({}, {})).toThrow()
  })
})
