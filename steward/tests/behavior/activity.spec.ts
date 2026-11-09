import { describe, expect, it } from 'vitest'
import { GET as getActivity } from '../../src/routes/api/tenants/[slug]/activity/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch, makeFakeFetch } from '../helpers/fake-fetch.js'

// Story 004: a tenant's activity feed, proxied to tower's operator route.

const page = {
  data: [
    {
      timestamp: '2026-11-09T12:00:00.000Z',
      actorType: 'account',
      actorId: 'acc-1',
      eventType: 'account.role-granted',
      summary: 'Recovery grant applied by an operator',
      actingAs: 'jane.operator',
    },
    {
      timestamp: '2026-11-07T12:00:00.000Z',
      actorType: 'application',
      actorId: 'app-1',
      eventType: 'application.created',
      summary: "Application 'portal' created",
      actingAs: null,
    },
  ],
  nextCursor: 'evt-acme-1',
}

describe('GET /api/tenants/:slug/activity', () => {
  it('requires a bearer token', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: page })
    const event = fakeEvent({ path: '/api/tenants/acme/activity', params: { slug: 'acme' }, fetchImpl })
    await expect(getActivity(event as any)).rejects.toMatchObject({ status: 401 })
    expect(calls).toHaveLength(0)
  })

  it("passes tower's page through unchanged", async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: page })
    const event = fakeEvent({
      path: '/api/tenants/acme/activity',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await getActivity(event as any)
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual(page)
    expect(calls[0].url).toContain('/operator/tenants/acme/activity')
  })

  it('sends neither limit nor cursor when the request has none', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: { data: [], nextCursor: null } })
    const event = fakeEvent({
      path: '/api/tenants/acme/activity',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    await getActivity(event as any)
    const url = new URL(calls[0].url)
    expect(url.searchParams.has('limit')).toBe(false)
    expect(url.searchParams.has('cursor')).toBe(false)
  })

  it('forwards limit and cursor to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: { data: [], nextCursor: null } })
    const event = fakeEvent({
      path: '/api/tenants/acme/activity?limit=10&cursor=evt-acme-2',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    await getActivity(event as any)
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('cursor')).toBe('evt-acme-2')
  })

  it("passes tower's 404 for an unknown tenant through", async () => {
    const fetchImpl = makeFakeFetch(() => ({ status: 404, body: { error: 'tenant not found' } }))
    const event = fakeEvent({
      path: '/api/tenants/nope/activity',
      params: { slug: 'nope' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await getActivity(event as any)
    expect(response.status).toBe(404)
    expect(await readJson(response)).toEqual({ error: 'tenant not found' })
  })

  it("passes tower's 5xx through", async () => {
    const fetchImpl = makeFakeFetch(() => ({ status: 503, body: { error: 'unavailable' } }))
    const event = fakeEvent({
      path: '/api/tenants/acme/activity',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await getActivity(event as any)
    expect(response.status).toBe(503)
  })

  it('answers 502 unreachable when tower cannot be reached', async () => {
    const fetchImpl = makeFakeFetch(() => 'network-error')
    const event = fakeEvent({
      path: '/api/tenants/acme/activity',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    const response = await getActivity(event as any)
    expect(response.status).toBe(502)
    expect(await readJson(response)).toMatchObject({ error: 'unreachable' })
  })
})
