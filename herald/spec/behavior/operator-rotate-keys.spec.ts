import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin, type SpySignetAdmin } from '../lib/fakes.js'
import { PayloadKeyring, type PersistedPayloadKeyGeneration } from '../../src/lib/payload-crypto.js'
import { UnsubscribeKeyring, type PersistedUnsubscribeKeyGeneration } from '../../src/lib/unsubscribe-token.js'

// Behavior tier: `POST /operator/rotate-keys` (ADR 0081) -- herald's own
// installation-wide key rotation, resolving the ADR 0025 gap that left
// tower publishing with a throwaway ephemeral key. Same operator-bearer-
// token model every other operator route in this system uses.

const OPERATOR_TOKEN = 'op-secret'

describe('POST /operator/rotate-keys', () => {
  let app: FastifyInstance
  let signetAdmin: SpySignetAdmin

  beforeEach(async () => {
    const consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    app = await buildApp({ consequent, signetAdmin, operatorToken: OPERATOR_TOKEN })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without a valid operator bearer token', async () => {
    const noAuth = await app.inject({ method: 'POST', url: '/operator/rotate-keys', payload: { keys: ['payload-encryption'] } })
    expect(noAuth.statusCode).toBe(403)

    const wrongToken = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { keys: ['payload-encryption'] },
    })
    expect(wrongToken.statusCode).toBe(403)

    expect(signetAdmin.calls).toHaveLength(0)
  })

  it('rotates payload-encryption: persists the full generation set to herald, distributes only the current public key to tower', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['payload-encryption'] },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rotated).toEqual([{ key: 'payload-encryption', version: 2 }]) // buildApp's default keyring already seeded generation 1
    expect(body.failed).toEqual([])

    const heraldPush = signetAdmin.calls.find((c) => c.targetService === 'herald' && c.key === 'payloadKeyGenerations')
    expect(heraldPush).toBeDefined()
    const persisted = JSON.parse(heraldPush!.value) as PersistedPayloadKeyGeneration[]
    // Both generations retained -- rotation never discards an old one.
    expect(persisted.map((g) => g.version).sort()).toEqual([1, 2])
    expect(persisted.every((g) => g.publicKeyPem.includes('BEGIN PUBLIC KEY'))).toBe(true)
    expect(persisted.every((g) => g.privateKeyPem.includes('BEGIN PRIVATE KEY'))).toBe(true)

    const towerPush = signetAdmin.calls.find((c) => c.targetService === 'tower' && c.key === 'heraldPayloadPublicKey')
    expect(towerPush).toBeDefined()
    const distributed = JSON.parse(towerPush!.value) as { version: number, publicKeyPem: string }
    // Only the *current* (post-rotate) key is distributed, never the old one.
    expect(distributed.version).toBe(2)
    expect(distributed.publicKeyPem.includes('BEGIN PUBLIC KEY')).toBe(true)

    // Never pushes payload-encryption material to keep/portcullis, which
    // don't actually publish comms.transactional.* messages yet.
    expect(signetAdmin.calls.some((c) => c.targetService === 'keep')).toBe(false)
    expect(signetAdmin.calls.some((c) => c.targetService === 'portcullis')).toBe(false)
  })

  it('rotates unsubscribe-signing: persists the full generation set to herald only, no cross-service distribution', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['unsubscribe-signing'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().rotated).toEqual([{ key: 'unsubscribe-signing', version: 2 }])

    expect(signetAdmin.calls).toHaveLength(1)
    const push = signetAdmin.calls[0]
    expect(push.targetService).toBe('herald')
    expect(push.key).toBe('unsubscribeKeyGenerations')
    const persisted = JSON.parse(push.value) as PersistedUnsubscribeKeyGeneration[]
    expect(persisted.map((g) => g.version).sort()).toEqual([1, 2])
  })

  it('rotates both keys in one request, independently', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['payload-encryption', 'unsubscribe-signing'] },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rotated).toEqual(
      expect.arrayContaining([
        { key: 'payload-encryption', version: 2 },
        { key: 'unsubscribe-signing', version: 2 },
      ]),
    )
    expect(body.failed).toEqual([])
  })

  it('reports a partial failure per-key rather than rolling back the other rotation', async () => {
    const failingSignetAdmin: SpySignetAdmin = {
      calls: [],
      async pushSecret(targetService, key, value) {
        if (targetService === 'tower') throw new Error('signet unreachable')
        failingSignetAdmin.calls.push({ targetService, key, value })
      },
    }
    const consequent = await buildInMemoryConsequent()
    const failingApp = await buildApp({ consequent, signetAdmin: failingSignetAdmin, operatorToken: OPERATOR_TOKEN })

    const response = await failingApp.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['payload-encryption', 'unsubscribe-signing'] },
    })

    // payload-encryption's tower push fails; unsubscribe-signing has no
    // cross-service push at all, so it succeeds independently -- 207,
    // not a full rollback of the other key.
    expect(response.statusCode).toBe(207)
    const body = response.json()
    expect(body.rotated).toEqual([{ key: 'unsubscribe-signing', version: 2 }])
    expect(body.failed).toEqual([{ key: 'payload-encryption', error: 'signet unreachable' }])

    await failingApp.close()
  })

  it('generations round-trip through PEM correctly -- a keyring seeded from the pushed payload-encryption secret can still decrypt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['payload-encryption'] },
    })
    expect(response.statusCode).toBe(200)

    const heraldPush = signetAdmin.calls.find((c) => c.targetService === 'herald' && c.key === 'payloadKeyGenerations')!
    const seeded = new PayloadKeyring(JSON.parse(heraldPush.value) as PersistedPayloadKeyGeneration[])
    expect(seeded.current().version).toBe(2)
    expect(seeded.get(1)).toBeDefined()
  })

  it('unsubscribe generations round-trip through base64 correctly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['unsubscribe-signing'] },
    })
    expect(response.statusCode).toBe(200)

    const push = signetAdmin.calls.find((c) => c.targetService === 'herald' && c.key === 'unsubscribeKeyGenerations')!
    const seeded = new UnsubscribeKeyring(JSON.parse(push.value) as PersistedUnsubscribeKeyGeneration[])
    expect(seeded.current()).toBe(2)
    expect(seeded.keyFor(1)).toBeDefined()
  })

  it('rejects an unknown key name at the schema level (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/rotate-keys',
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      payload: { keys: ['not-a-real-key'] },
    })
    expect(response.statusCode).toBe(400)
  })
})
