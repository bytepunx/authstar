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

  it('rotates independently selected keys and forwards them to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: { rotated: ['session', 'identity-hash'] } })
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
    const body = (await readJson(response)) as { rotated: string[] }
    expect(body.rotated).toEqual(['session', 'identity-hash'])
  })
})
