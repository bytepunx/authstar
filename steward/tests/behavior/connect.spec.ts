import { describe, expect, it } from 'vitest'
import { POST } from '../../src/routes/api/connect/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { makeFakeFetch } from '../helpers/fake-fetch.js'
import type { ConnectResult } from '../../src/lib/types.js'

// Story 001: the Connect screen's token-confirmation call.

describe('POST /api/connect', () => {
  it('confirms a valid token and reports the tower installation it reached', async () => {
    const fetchImpl = makeFakeFetch((url) => {
      expect(url).toContain('/operator/tenants')
      expect(url).toContain('limit=1')
      return { status: 200, body: { items: [], total: 42 } }
    })

    const event = fakeEvent({ method: 'POST', path: '/api/connect', body: { token: 'good-token' }, fetchImpl })
    const response = await POST(event as any)
    expect(response.status).toBe(200)
    const result = (await readJson(response)) as ConnectResult
    expect(result.ok).toBe(true)
    expect(result.tenantCount).toBe(42)
  })

  it('forwards the token as a bearer header, never in the query string', async () => {
    const fetchImpl = makeFakeFetch((_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer good-token')
      return { status: 200, body: { items: [], total: 0 } }
    })
    const event = fakeEvent({ method: 'POST', path: '/api/connect', body: { token: 'good-token' }, fetchImpl })
    await POST(event as any)
  })

  it('reports invalid-token distinctly from unreachable, for a 401 from tower', async () => {
    const fetchImpl = makeFakeFetch(() => ({ status: 401, body: { error: 'unauthorized' } }))
    const event = fakeEvent({ method: 'POST', path: '/api/connect', body: { token: 'bad-token' }, fetchImpl })
    const result = (await readJson(await POST(event as any))) as ConnectResult
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid-token')
  })

  it('reports unreachable distinctly from invalid-token, for a network failure', async () => {
    const fetchImpl = makeFakeFetch(() => 'network-error')
    const event = fakeEvent({ method: 'POST', path: '/api/connect', body: { token: 'any-token' }, fetchImpl })
    const result = (await readJson(await POST(event as any))) as ConnectResult
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unreachable')
  })

  it('rejects a missing token before ever calling tower', async () => {
    let called = false
    const fetchImpl = makeFakeFetch(() => {
      called = true
      return { status: 200, body: {} }
    })
    const event = fakeEvent({ method: 'POST', path: '/api/connect', body: {}, fetchImpl })
    const response = await POST(event as any)
    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })
})
