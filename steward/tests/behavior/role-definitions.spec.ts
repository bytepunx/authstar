import { describe, expect, it } from 'vitest'
import { GET as listRoleDefinitions, POST as createRoleDefinition } from '../../src/routes/api/tenants/[slug]/role-definitions/+server.js'
import { DELETE as retireRoleDefinition } from '../../src/routes/api/tenants/[slug]/role-definitions/[name]/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch, makeFakeFetch } from '../helpers/fake-fetch.js'

// authstar-steward#1: role definition management.

describe('GET /api/tenants/:slug/role-definitions', () => {
  it('requires a bearer token', async () => {
    const event = fakeEvent({ path: '/api/tenants/acme/role-definitions', params: { slug: 'acme' } })
    await expect(listRoleDefinitions(event as any)).rejects.toMatchObject({ status: 401 })
  })

  it('passes through the bare-array shape from tower', async () => {
    const fetchImpl = makeFakeFetch(() => ({
      status: 200,
      body: [{ tenant: 'acme', name: 'plan:family', scope: { application: 'loci' }, description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z' }],
    }))
    const event = fakeEvent({ path: '/api/tenants/acme/role-definitions', params: { slug: 'acme' }, headers: { authorization: 'Bearer t' }, fetchImpl })
    const response = await listRoleDefinitions(event as any)
    const body = (await readJson(response)) as Array<{ name: string }>
    expect(body[0].name).toBe('plan:family')
  })
})

describe('POST /api/tenants/:slug/role-definitions', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/role-definitions',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      body: { name: 'plan:family', scope: { application: 'loci' } },
    })
    await expect(createRoleDefinition(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('forwards the create body to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 201,
      body: { tenant: 'acme', name: 'plan:family', scope: { application: 'loci' }, description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/role-definitions',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { name: 'plan:family', scope: { application: 'loci' } },
      fetchImpl,
    })
    const response = await createRoleDefinition(event as any)
    expect(response.status).toBe(201)
    expect(calls[0].url).toContain('/operator/tenants/acme/role-definitions')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ name: 'plan:family', scope: { application: 'loci' } })
  })
})

describe('DELETE /api/tenants/:slug/role-definitions/:name (retire)', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/role-definitions/plan:family',
      params: { slug: 'acme', name: 'plan:family' },
      headers: { authorization: 'Bearer t' },
    })
    await expect(retireRoleDefinition(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('forwards applicationScope as a query param, not part of the path', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 200,
      body: { tenant: 'acme', name: 'plan:family', scope: { application: 'loci' }, description: '', status: 'retired', createdAt: '2026-01-01T00:00:00Z' },
    })
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/role-definitions/plan:family?applicationScope=loci',
      params: { slug: 'acme', name: 'plan:family' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    const response = await retireRoleDefinition(event as any)
    expect(response.status).toBe(200)
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].url).toContain('/role-definitions/acme%3Aloci%3Aplan%3Afamily')
  })

  it('computes a tenant-wide id with no applicationScope query param', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 200,
      body: { tenant: 'acme', name: 'tenant:manage', scope: 'tenant', description: '', status: 'retired', createdAt: '2026-01-01T00:00:00Z' },
    })
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/role-definitions/tenant:manage',
      params: { slug: 'acme', name: 'tenant:manage' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    await retireRoleDefinition(event as any)
    expect(calls[0].url).toContain('/role-definitions/acme%3Atenant%3Amanage')
  })
})
