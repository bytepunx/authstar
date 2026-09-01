import { describe, it, expect } from 'vitest'
import { resolveProvisioningConfig, resolveSignetAdminToken } from '../../src/lib/signet-bundle-config.js'

// ADR 0102 / Story 016: tower is always in Signet-Configured Mode (its
// bootstrap coordinates -- SIGNET_ADDR/SIGNET_NAMESPACE/SIGNET_TRUST_DOMAIN
// -- are `requireEnv`'d unconditionally in server.ts, no Env-Only Mode
// exists for tower). A field these two resolvers expect that's missing
// from the fetched bundle must fail startup naming the exact missing
// field/secret -- never a silent `?? false` / `?? ''` / `?? {...}`
// hardcoded literal, and never an env-var fallback.

const validProvisioning = {
  selfServiceEnabled: true,
  defaultProvider: {
    name: 'acme-oidc',
    clientId: 'client-abc',
    discoveryUrl: 'https://idp.example.test/.well-known/openid-configuration',
    scope: ['openid', 'email'],
  },
}

const validSecrets: Record<string, string> = {
  signetAdminToken: 'admin-tok',
  operatorToken: 'op-tok',
  'default-provider-client-secret': 'provider-secret',
}

describe('resolveSignetAdminToken', () => {
  it('returns the bundle-sourced token when present', () => {
    expect(resolveSignetAdminToken({ signetAdminToken: 'tok-123' })).toBe('tok-123')
  })

  it('throws naming the missing field when signetAdminToken secret is absent, with no env fallback', () => {
    expect(() => resolveSignetAdminToken({})).toThrow(/signetAdminToken/)
  })

  it('throws when signetAdminToken is present but empty', () => {
    expect(() => resolveSignetAdminToken({ signetAdminToken: '' })).toThrow(/signetAdminToken/)
  })
})

describe('resolveProvisioningConfig', () => {
  it('returns the expected config object for full valid input', () => {
    const result = resolveProvisioningConfig({ provisioning: validProvisioning }, validSecrets)
    expect(result).toEqual({
      selfServiceEnabled: true,
      operatorToken: 'op-tok',
      defaultProvider: validProvisioning.defaultProvider,
      defaultProviderClientSecret: 'provider-secret',
    })
  })

  it('throws naming "provisioning" when the whole block is missing from the bundle', () => {
    expect(() => resolveProvisioningConfig({}, validSecrets)).toThrow(/provisioning/)
  })

  it('throws naming "selfServiceEnabled" when it is missing', () => {
    const { selfServiceEnabled: _drop, ...rest } = validProvisioning
    expect(() => resolveProvisioningConfig({ provisioning: rest }, validSecrets)).toThrow(/selfServiceEnabled/)
  })

  it('accepts an explicit false selfServiceEnabled as valid, not "missing"', () => {
    const result = resolveProvisioningConfig(
      { provisioning: { ...validProvisioning, selfServiceEnabled: false } },
      validSecrets,
    )
    expect(result.selfServiceEnabled).toBe(false)
  })

  it('throws naming "operatorToken" when the secret is missing', () => {
    const { operatorToken: _drop, ...secretsWithoutOperatorToken } = validSecrets
    expect(() => resolveProvisioningConfig({ provisioning: validProvisioning }, secretsWithoutOperatorToken))
      .toThrow(/operatorToken/)
  })

  it('throws naming "defaultProvider" when it is missing', () => {
    const { defaultProvider: _drop, ...rest } = validProvisioning
    expect(() => resolveProvisioningConfig({ provisioning: rest }, validSecrets)).toThrow(/defaultProvider/)
  })

  it('names the specific missing sub-field(s) when defaultProvider is present but incomplete', () => {
    const incomplete = {
      ...validProvisioning,
      defaultProvider: { name: 'acme-oidc', clientId: '', discoveryUrl: 'https://idp.example.test', scope: [] as string[] },
    }
    expect(() => resolveProvisioningConfig({ provisioning: incomplete }, validSecrets))
      .toThrow(/defaultProvider\.clientId/)
  })

  it('names multiple missing sub-fields together when more than one is absent', () => {
    const incomplete = {
      ...validProvisioning,
      defaultProvider: { name: '', clientId: '', discoveryUrl: 'https://idp.example.test', scope: ['openid'] },
    }
    try {
      resolveProvisioningConfig({ provisioning: incomplete }, validSecrets)
      expect.unreachable()
    } catch (err) {
      expect((err as Error).message).toMatch(/defaultProvider\.name/)
      expect((err as Error).message).toMatch(/defaultProvider\.clientId/)
    }
  })

  it('throws naming "default-provider-client-secret" when that secret is missing', () => {
    const { 'default-provider-client-secret': _drop, ...secretsWithoutClientSecret } = validSecrets
    expect(() => resolveProvisioningConfig({ provisioning: validProvisioning }, secretsWithoutClientSecret))
      .toThrow(/default-provider-client-secret/)
  })
})
