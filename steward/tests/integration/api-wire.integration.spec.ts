import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startFakeBackend, type FakeBackend } from '../helpers/fake-backend-server.js'
import { startStewardServer, type RunningStewardServer } from '../helpers/steward-server.js'

// Integration tier -- steward's judgment call, documented in TESTING.md:
// steward owns no database or other real direct dependency of its own
// (Story 001: "no cookie, no server-side session record at all"). Its one
// real integration point is the network hop from its own HTTP server to
// tower/herald. This tier proves that hop for real: a real built steward
// server process (adapter-node's build/index.js), a real fake-but-
// contract-faithful tower HTTP server on a real port, real `fetch()` calls
// between them -- no browser, no in-process stubbing of steward's own
// handler functions (that's the behavior tier).

describe('steward server <-> fake tower, over real HTTP', () => {
  let backend: FakeBackend
  let steward: RunningStewardServer

  beforeAll(async () => {
    backend = await startFakeBackend()
    steward = await startStewardServer({ TOWER_URL: backend.url })
  }, 30_000)

  afterAll(async () => {
    await steward?.stop()
    await backend?.close()
  })

  it('confirms a valid token through a real network round trip', async () => {
    const response = await fetch(`${steward.url}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: backend.state.validToken }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean; towerUrl?: string }
    expect(body.ok).toBe(true)
    expect(body.towerUrl).toBeDefined()
  })

  it('reports an invalid token distinctly from an unreachable backend', async () => {
    const response = await fetch(`${steward.url}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-the-right-token' }),
    })
    const body = (await response.json()) as { ok: boolean; reason?: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('invalid-token')
  })

  it('lists and searches tenants through the real proxy', async () => {
    const response = await fetch(`${steward.url}/api/tenants?search=acme`, {
      headers: { Authorization: `Bearer ${backend.state.validToken}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Array<{ slug: string }>; nextCursor: string | null }
    expect(body.data.map((t) => t.slug)).toEqual(['acme'])
  })

  it('rejects a request with no bearer token at the real HTTP layer', async () => {
    const response = await fetch(`${steward.url}/api/tenants`)
    expect(response.status).toBe(401)
  })

  it('rejects a mutating request missing X-Operator-Actor at the real HTTP layer', async () => {
    const response = await fetch(`${steward.url}/api/tenants/globex/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}` },
    })
    expect(response.status).toBe(400)
  })

  it('reactivates a suspended tenant end to end, verifiable in a subsequent search', async () => {
    const reactivate = await fetch(`${steward.url}/api/tenants/globex/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'X-Operator-Actor': 'integration-test' },
    })
    expect(reactivate.status).toBe(200)

    const search = await fetch(`${steward.url}/api/tenants?search=globex`, {
      headers: { Authorization: `Bearer ${backend.state.validToken}` },
    })
    const body = (await search.json()) as { data: Array<{ slug: string; status: string }> }
    expect(body.data[0].status).toBe('active')
  })

  it('creates a tenant end to end and surfaces a duplicate-slug failure with its failed step on retry semantics', async () => {
    const create = await fetch(`${steward.url}/api/tenants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'newco', name: 'New Co', adminEmail: 'admin@newco.test' }),
    })
    expect(create.status).toBe(201)
    const created = (await create.json()) as { slug: string; adminHost: string }
    expect(created.slug).toBe('newco')
    expect(created.adminHost).toContain('newco')

    const duplicate = await fetch(`${steward.url}/api/tenants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'newco', name: 'New Co', adminEmail: 'admin@newco.test' }),
    })
    expect(duplicate.status).toBe(409)
    const failure = (await duplicate.json()) as { failedStep?: string }
    expect(failure.failedStep).toBe('validate-slug')
  })

  it('rotates tenant keys end to end', async () => {
    const response = await fetch(`${steward.url}/api/tenants/acme/rotate-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'X-Operator-Actor': 'integration-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: ['session', 'identity-hash'] }),
    })
    expect(response.status).toBe(200)
    // Real tower shape (src/routes/rotate-keys.ts): an array of
    // { key, version, effectiveFrom } objects, not bare key strings -- this
    // assertion used to match the fake backend's old (wrong) echo-back
    // behavior, not tower's actual contract. See fake-backend-server.ts's
    // own comment on the same fix.
    const body = (await response.json()) as { rotated: Array<{ key: string; version: number; effectiveFrom: string }> }
    expect(body.rotated.map((r) => r.key)).toEqual(['session', 'identity-hash'])
    expect(body.rotated.every((r) => typeof r.version === 'number' && typeof r.effectiveFrom === 'string')).toBe(true)
  })

  it('grants and revokes a permission end to end, and reflects it in the accounts read', async () => {
    const grant = await fetch(`${steward.url}/api/tenants/acme/accounts/acc-2/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'X-Operator-Actor': 'integration-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: null, role: 'billing' }),
    })
    expect(grant.status).toBe(200)

    const afterGrant = await fetch(`${steward.url}/api/tenants/acme/accounts`, {
      headers: { Authorization: `Bearer ${backend.state.validToken}` },
    })
    const afterGrantBody = (await afterGrant.json()) as Array<{ id: string; permissions: unknown[] }>
    expect(afterGrantBody.find((a) => a.id === 'acc-2')?.permissions).toHaveLength(1)

    const revoke = await fetch(`${steward.url}/api/tenants/acme/accounts/acc-2/permissions/${encodeURIComponent(':billing')}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${backend.state.validToken}`, 'X-Operator-Actor': 'integration-test' },
    })
    expect(revoke.status).toBe(204)

    const afterRevoke = await fetch(`${steward.url}/api/tenants/acme/accounts`, {
      headers: { Authorization: `Bearer ${backend.state.validToken}` },
    })
    const afterRevokeBody = (await afterRevoke.json()) as Array<{ id: string; permissions: unknown[] }>
    expect(afterRevokeBody.find((a) => a.id === 'acc-2')?.permissions).toHaveLength(0)
  })
})
