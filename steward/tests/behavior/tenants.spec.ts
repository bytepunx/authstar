import { describe, expect, it } from 'vitest'
import { GET, POST } from '../../src/routes/api/tenants/+server.js'
import { POST as reactivate } from '../../src/routes/api/tenants/[slug]/reactivate/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch, makeFakeFetch } from '../helpers/fake-fetch.js'

// Story 002: Tenant Search and Creation.

describe('GET /api/tenants', () => {
  it('requires a bearer token', async () => {
    const event = fakeEvent({ path: '/api/tenants' })
    await expect(GET(event as any)).rejects.toMatchObject({ status: 401 })
  })

  it('forwards the search query to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: { data: [], nextCursor: null } })
    const event = fakeEvent({
      path: '/api/tenants?search=acme',
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    await GET(event as any)
    expect(calls[0].url).toContain('search=acme')
  })

  // Matches tower's real GET /operator/tenants response exactly (routes/
  // operator.ts) -- cursor-based pagination, not items/total. See
  // TenantListResponse's own comment in src/lib/types.ts for why this
  // matters: the old (wrong) assumed shape here is exactly what let the
  // real bug (tenants/+page.svelte reading result.items, always undefined)
  // ship unnoticed.
  it('passes through the tenant list shape from tower', async () => {
    const fetchImpl = makeFakeFetch(() => ({
      status: 200,
      body: { data: [{ slug: 'acme', name: 'Acme', status: 'active' }], nextCursor: null },
    }))
    const event = fakeEvent({ path: '/api/tenants', headers: { authorization: 'Bearer t' }, fetchImpl })
    const response = await GET(event as any)
    const body = (await readJson(response)) as { data: unknown[]; nextCursor: string | null }
    expect(body.nextCursor).toBeNull()
    expect(body.data[0]).toMatchObject({ slug: 'acme', status: 'active' })
  })
})

describe('POST /api/tenants (create)', () => {
  it('does not require X-Operator-Actor -- not on tower operator tree', async () => {
    const fetchImpl = makeFakeFetch(() => ({ status: 201, body: { slug: 'acme', adminHost: 'admin.acme.authstar.app' } }))
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants',
      headers: { authorization: 'Bearer t' },
      body: { slug: 'acme', name: 'Acme', adminEmail: 'a@acme.test' },
      fetchImpl,
    })
    const response = await POST(event as any)
    expect(response.status).toBe(201)
  })

  it('still requires a bearer token', async () => {
    const event = fakeEvent({ method: 'POST', path: '/api/tenants', body: {} })
    await expect(POST(event as any)).rejects.toMatchObject({ status: 401 })
  })

  it('passes through a partial-provisioning failure with its failed step', async () => {
    const fetchImpl = makeFakeFetch(() => ({
      status: 500,
      body: { error: 'herald unreachable', failedStep: 'invite-dispatch' },
    }))
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants',
      headers: { authorization: 'Bearer t' },
      body: { slug: 'acme', name: 'Acme', adminEmail: 'a@acme.test' },
      fetchImpl,
    })
    const response = await POST(event as any)
    expect(response.status).toBe(500)
    const body = (await readJson(response)) as { failedStep: string }
    expect(body.failedStep).toBe('invite-dispatch')
  })
})

describe('POST /api/tenants/:slug/reactivate', () => {
  it('requires X-Operator-Actor -- this is an operator-tree mutation', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/reactivate',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
    })
    await expect(reactivate(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('sends PATCH status:active to tower, forwarding the actor label', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: { slug: 'acme', status: 'active' } })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/reactivate',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    const response = await reactivate(event as any)
    expect(response.status).toBe(200)
    expect(calls[0].init?.method).toBe('PATCH')
    const headers = new Headers(calls[0].init?.headers)
    expect(headers.get('x-operator-actor')).toBe('alice')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ status: 'active' })
  })
})
