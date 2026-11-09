import { describe, expect, it } from 'vitest'
import { GET } from '../../src/routes/api/erasure-requests/stuck/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch } from '../helpers/fake-fetch.js'

// Story 004: Stuck Erasure Requests, cross-tenant (ADR 0075). Tower's
// GET /operator/erasure-requests/stuck answers a bare array, oldest first.

const stuck = [
  { tenant: 'acme', contactId: 'contact-acme-1', requestedAt: '2026-11-04T10:00:00.000Z', outstandingServices: ['herald'] },
  { tenant: 'globex', contactId: 'contact-globex-1', requestedAt: '2026-11-08T10:00:00.000Z', outstandingServices: ['keep'] },
]

describe('GET /api/erasure-requests/stuck', () => {
  it('requires a bearer token', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: [] })
    const event = fakeEvent({ path: '/api/erasure-requests/stuck', fetchImpl })
    await expect(GET(event as any)).rejects.toMatchObject({ status: 401 })
    expect(calls).toHaveLength(0)
  })

  it("passes tower's list through unchanged", async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: stuck })
    const event = fakeEvent({
      path: '/api/erasure-requests/stuck',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await GET(event as any)
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual(stuck)
    expect(calls[0].url).toContain('/operator/erasure-requests/stuck')
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer t')
  })

  it('forwards the default threshold of 72 hours when none is given', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: [] })
    const event = fakeEvent({
      path: '/api/erasure-requests/stuck',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    await GET(event as any)
    expect(new URL(calls[0].url).searchParams.get('olderThanHours')).toBe('72')
  })

  it('forwards a given threshold to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: stuck })
    const event = fakeEvent({
      path: '/api/erasure-requests/stuck?olderThanHours=24',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await GET(event as any)
    expect(response.status).toBe(200)
    expect(new URL(calls[0].url).searchParams.get('olderThanHours')).toBe('24')
  })

  it.each(['0', '-5', '1.5', 'abc', ''])('answers 400 without calling tower for olderThanHours=%j', async (value) => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: [] })
    const event = fakeEvent({
      path: `/api/erasure-requests/stuck?olderThanHours=${encodeURIComponent(value)}`,
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await GET(event as any)
    expect(response.status).toBe(400)
    expect(await readJson(response)).toEqual({ error: 'olderThanHours must be a positive whole number of hours' })
    expect(calls).toHaveLength(0)
  })

  it("passes tower's 5xx through", async () => {
    const { fetchImpl } = capturingFakeFetch({ status: 503, body: { error: 'unavailable' } })
    const event = fakeEvent({
      path: '/api/erasure-requests/stuck',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await GET(event as any)
    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({ error: 'unavailable' })
  })

  it('answers 502 unreachable when tower cannot be reached', async () => {
    const { fetchImpl } = capturingFakeFetch('network-error')
    const event = fakeEvent({
      path: '/api/erasure-requests/stuck',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await GET(event as any)
    expect(response.status).toBe(502)
    expect(await readJson(response)).toMatchObject({ error: 'unreachable' })
  })
})
