import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPrivateKey } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin } from '../lib/fakes.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// Behavior tier for `POST /operator/tenants/{tenantSlug}/rotate-keys`
// (ADR 0080/0088, design/stories/tower/011). `signetAdmin` is the spy fake
// (see spec/lib/fakes.ts) -- no real signet, but real assertions on exactly
// what would have been pushed/patched.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'dex', clientId: 'client-1', discoveryUrl: 'https://dex.example/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'provider-secret-value',
}

describe('POST /operator/tenants/:tenantSlug/rotate-keys', () => {
  let app: FastifyInstance
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>

  beforeEach(async () => {
    const consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    app = await buildApp({ consequent, signetAdmin, provisioningConfig })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without a valid operator token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      payload: { keys: ['session'] },
    })
    expect(response.statusCode).toBe(403)
    expect(signetAdmin.calls).toHaveLength(0)
  })

  it('rejects an empty keys array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: [] },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an unknown key type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: ['bogus'] },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rotates a session key: pushes a real EC keypair and patches the generations array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: ['session'] },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rotated).toHaveLength(1)
    expect(body.rotated[0].key).toBe('session')
    expect(body.failed).toHaveLength(0)

    expect(signetAdmin.calls).toHaveLength(1)
    const pushed = signetAdmin.calls[0]
    expect(pushed.targetService).toBe('portcullis')
    // Versioned name (not the legacy "tenant-acme-session-key") -- version 1
    // is always the pre-existing legacy secret, rotation always produces >1.
    expect(pushed.key).toMatch(/^tenant-acme-session-key-\d+$/)
    expect(pushed.key).not.toBe('tenant-acme-session-key')

    // Real PKCS8 P-256 EC private key, matching provisioning's own keys --
    // portcullis's EcKeyPair::from_pem_bytes needs real key material.
    const parsed = createPrivateKey(pushed.value)
    expect(parsed.asymmetricKeyType).toBe('ec')
    expect((parsed.asymmetricKeyDetails as { namedCurve?: string }).namedCurve).toBe('prime256v1')

    expect(signetAdmin.patchCalls).toHaveLength(1)
    const patch = signetAdmin.patchCalls[0]
    expect(patch.targetService).toBe('portcullis')
    expect(patch.operations).toHaveLength(1)
    expect(patch.operations[0].op).toBe('add')
    expect(patch.operations[0].path).toBe('/tenants/acme/sessionKeyGenerations/-')
    const value = patch.operations[0].value as { version: number, effectiveFrom: string }
    expect(typeof value.version).toBe('number')
    expect(new Date(value.effectiveFrom).toISOString()).toBe(value.effectiveFrom)
    // The pushed secret's version suffix and the patched generation's
    // version must be the exact same number -- otherwise the generation
    // entry would point at a secret name that doesn't exist.
    expect(pushed.key).toBe(`tenant-acme-session-key-${value.version}`)
  })

  it('rotates internal and identity-hash keys independently in one call', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: ['internal', 'identity-hash'] },
    })

    expect(response.statusCode).toBe(200)
    expect(signetAdmin.calls).toHaveLength(2)
    expect(signetAdmin.patchCalls).toHaveLength(2)

    const internalPush = signetAdmin.calls.find((c) => c.key.startsWith('tenant-acme-internal-key-'))!
    const internalKey = createPrivateKey(internalPush.value)
    expect(internalKey.asymmetricKeyType).toBe('ec')

    const identityHashPush = signetAdmin.calls.find((c) => c.key.startsWith('tenant-acme-identity-hash-key-'))!
    // Identity-hash key is opaque HMAC-style bytes, not an EC key -- same
    // distinction provisioning.spec.ts already asserts for the initial one.
    expect(identityHashPush.value).not.toContain('BEGIN')

    const identityHashPatch = signetAdmin.patchCalls.find((c) =>
      c.operations[0].path === '/tenants/acme/identityHashKeyGenerations/-',
    )
    expect(identityHashPatch).toBeTruthy()
    const internalPatch = signetAdmin.patchCalls.find((c) =>
      c.operations[0].path === '/tenants/acme/internalKeyGenerations/-',
    )
    expect(internalPatch).toBeTruthy()
  })

  it('rotating all three key types in one call produces three independent generations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: ['session', 'internal', 'identity-hash'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().rotated).toHaveLength(3)
    expect(signetAdmin.calls).toHaveLength(3)
    expect(signetAdmin.patchCalls).toHaveLength(3)
  })
})
