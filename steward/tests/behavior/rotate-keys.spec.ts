import { describe, expect, it } from 'vitest'
import { POST as rotateKeys } from '../../src/routes/api/tenants/[slug]/rotate-keys/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch } from '../helpers/fake-fetch.js'

// Story 005: Rotate Tenant Keys.

describe('POST /api/tenants/:slug/rotate-keys', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/rotate-keys',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      body: { keys: ['session'] },
    })
    await expect(rotateKeys(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('rejects an empty keys array before calling tower', async () => {
    let called = false
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/rotate-keys',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { keys: [] },
      fetchImpl: (async () => {
        called = true
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })
    const response = await rotateKeys(event as any)
    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('rejects an unknown key name', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/rotate-keys',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { keys: ['session', 'bogus'] },
    })
    const response = await rotateKeys(event as any)
    expect(response.status).toBe(400)
  })

  it('rotates independently selected keys and forwards tower\'s real response shape', async () => {
    // Matches tower's actual response (tower/src/routes/rotate-keys.ts): each
    // rotated key reports its own generation, plus a `failed` array for
    // partial-failure reporting -- not a bare array of key names.
    const towerResponse = {
      rotated: [
        { key: 'session', version: 1723600000, effectiveFrom: '2026-08-14T00:00:00.000Z' },
        { key: 'identity-hash', version: 1723600000, effectiveFrom: '2026-08-14T00:00:00.000Z' },
      ],
      failed: [],
    }
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: towerResponse })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/rotate-keys',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { keys: ['session', 'identity-hash'] },
      fetchImpl,
    })
    const response = await rotateKeys(event as any)
    expect(calls[0].url).toContain('/operator/tenants/acme/rotate-keys')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ keys: ['session', 'identity-hash'] })
    const body = (await readJson(response)) as typeof towerResponse
    expect(body).toEqual(towerResponse)
  })
})
