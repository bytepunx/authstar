import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPrivateKey } from 'node:crypto'
import { jsonPatchAdd } from '@bytepunx/signet-client'
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
    // Seeds the tenant document a real provisioning flow would already have
    // created (ADR 0080's version-1 legacy generation baseline) -- appending
    // to `.../sessionKeyGenerations/-` (RFC 6902) requires the array to
    // already exist at that path, same as real signet's PatchServiceConfig.
    await signetAdmin.patchConfig('portcullis', [
      jsonPatchAdd('/tenants/acme', {
        cookie: { maxAge: 604_800 },
        sessionKeyGenerations: [],
        internalKeyGenerations: [],
        identityHashKeyGenerations: [],
      }),
    ])
    signetAdmin.patchCalls.length = 0 // seeding isn't part of what tests assert on
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

  it('rejects the old x-operator-token header -- steward never sends it, only Authorization: Bearer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { keys: ['session'] },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects an empty keys array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { authorization: 'Bearer op-secret' },
      payload: { keys: [] },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an unknown key type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { authorization: 'Bearer op-secret' },
      payload: { keys: ['bogus'] },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rotates a session key: pushes a real EC keypair and patches the generations array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/acme/rotate-keys',
      headers: { authorization: 'Bearer op-secret' },
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
      headers: { authorization: 'Bearer op-secret' },
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
      headers: { authorization: 'Bearer op-secret' },
      payload: { keys: ['session', 'internal', 'identity-hash'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().rotated).toHaveLength(3)
    expect(signetAdmin.calls).toHaveLength(3)
    expect(signetAdmin.patchCalls).toHaveLength(3)
  })

  describe('pruning past-retention generations (bytepunx/authstar-tower#2)', () => {
    it('prunes a session key generation past the tenant cookie.maxAge window, keeping the current one', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stale = { version: now - 700_000, effectiveFrom: new Date((now - 700_000) * 1000).toISOString() }
      const fresh = { version: now - 100, effectiveFrom: new Date((now - 100) * 1000).toISOString() }
      await signetAdmin.patchConfig('portcullis', [
        jsonPatchAdd('/tenants/acme/sessionKeyGenerations', [stale, fresh]),
      ])
      signetAdmin.patchCalls.length = 0

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/rotate-keys',
        headers: { authorization: 'Bearer op-secret' },
        payload: { keys: ['session'] },
      })

      expect(response.statusCode).toBe(200)
      // One patch for the rotation's own append, a second for the prune's test+remove.
      expect(signetAdmin.patchCalls).toHaveLength(2)
      const prunePatch = signetAdmin.patchCalls[1]
      expect(prunePatch.operations.map((op) => op.op)).toEqual(['test', 'remove'])
      expect(prunePatch.operations[0].path).toBe('/tenants/acme/sessionKeyGenerations/0')

      const config = await signetAdmin.getConfig('portcullis')
      const generations = (config!.content as { tenants: { acme: { sessionKeyGenerations: Array<{ version: number }> } } })
        .tenants.acme.sessionKeyGenerations
      expect(generations).toHaveLength(2) // "fresh" plus the just-rotated generation
      expect(generations.some((g) => g.version === stale.version)).toBe(false)
      expect(generations.some((g) => g.version === fresh.version)).toBe(true)
    })

    it('never prunes the current (highest-version) generation, regardless of age', async () => {
      const now = Math.floor(Date.now() / 1000)
      const ancient = { version: now - 10_000_000, effectiveFrom: new Date((now - 10_000_000) * 1000).toISOString() }
      await signetAdmin.patchConfig('portcullis', [
        jsonPatchAdd('/tenants/acme/sessionKeyGenerations', [ancient]),
      ])
      signetAdmin.patchCalls.length = 0

      // Rotating internal keys shouldn't touch the session generations array at all.
      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/rotate-keys',
        headers: { authorization: 'Bearer op-secret' },
        payload: { keys: ['internal'] },
      })

      expect(response.statusCode).toBe(200)
      const config = await signetAdmin.getConfig('portcullis')
      const generations = (config!.content as { tenants: { acme: { sessionKeyGenerations: Array<{ version: number }> } } })
        .tenants.acme.sessionKeyGenerations
      // Untouched: the ancient session generation is still the sole (and thus
      // current, highest-version) entry in its own array, never pruned by an
      // unrelated internal-key rotation.
      expect(generations).toEqual([ancient])
    })

    it('prunes internal key generations using the fixed 300s window, ignoring a much larger cookie.maxAge', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stale = { version: now - 400, effectiveFrom: new Date((now - 400) * 1000).toISOString() }
      await signetAdmin.patchConfig('portcullis', [
        jsonPatchAdd('/tenants/acme/cookie', { maxAge: 999_999_999 }),
        jsonPatchAdd('/tenants/acme/internalKeyGenerations', [stale]),
      ])
      signetAdmin.patchCalls.length = 0

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/rotate-keys',
        headers: { authorization: 'Bearer op-secret' },
        payload: { keys: ['internal'] },
      })

      expect(response.statusCode).toBe(200)
      expect(signetAdmin.patchCalls).toHaveLength(2)

      const config = await signetAdmin.getConfig('portcullis')
      const generations = (config!.content as { tenants: { acme: { internalKeyGenerations: Array<{ version: number }> } } })
        .tenants.acme.internalKeyGenerations
      expect(generations).toHaveLength(1) // only the just-rotated generation remains
      expect(generations.some((g) => g.version === stale.version)).toBe(false)
    })

    it('does not issue a second patch when nothing is stale', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/rotate-keys',
        headers: { authorization: 'Bearer op-secret' },
        payload: { keys: ['identity-hash'] },
      })

      expect(response.statusCode).toBe(200)
      expect(signetAdmin.patchCalls).toHaveLength(1)
    })
  })
})
