import { describe, expect, it } from 'vitest'
import { GET as listApplications, POST as createApplication } from '../../src/routes/api/tenants/[slug]/applications/+server.js'
import { DELETE as deleteApplication } from '../../src/routes/api/tenants/[slug]/applications/[appSlug]/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch, makeFakeFetch } from '../helpers/fake-fetch.js'

// bytepunx/authstar-tower#3's own prerequisite: application registration,
// so `loci` can exist before its scoped role definitions can be created.

describe('GET /api/tenants/:slug/applications', () => {
  it('requires a bearer token', async () => {
    const event = fakeEvent({ path: '/api/tenants/acme/applications', params: { slug: 'acme' } })
    await expect(listApplications(event as any)).rejects.toMatchObject({ status: 401 })
  })

  it('passes through the bare-array shape from tower', async () => {
    const fetchImpl = makeFakeFetch(() => ({
      status: 200,
      body: [{ tenant: 'acme', slug: 'loci', name: 'Loci', hosts: ['loci.acme.test'], publicUrl: '', exposedProviders: [], status: 'active', createdAt: '2026-01-01T00:00:00Z' }],
    }))
    const event = fakeEvent({ path: '/api/tenants/acme/applications', params: { slug: 'acme' }, headers: { authorization: 'Bearer t' }, fetchImpl })
    const response = await listApplications(event as any)
    const body = (await readJson(response)) as Array<{ slug: string }>
    expect(body[0].slug).toBe('loci')
  })
})

describe('POST /api/tenants/:slug/applications', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/applications',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      body: { slug: 'loci', name: 'Loci' },
    })
    await expect(createApplication(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('forwards the create body to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 201,
      body: { tenant: 'acme', slug: 'loci', name: 'Loci', hosts: ['loci.acme.test'], publicUrl: '', exposedProviders: [], status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/applications',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { slug: 'loci', name: 'Loci', hosts: ['loci.acme.test'] },
      fetchImpl,
    })
    const response = await createApplication(event as any)
    expect(response.status).toBe(201)
    expect(calls[0].url).toContain('/operator/tenants/acme/applications')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ slug: 'loci', name: 'Loci', hosts: ['loci.acme.test'] })
  })
})

describe('DELETE /api/tenants/:slug/applications/:appSlug', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/applications/loci',
      params: { slug: 'acme', appSlug: 'loci' },
      headers: { authorization: 'Bearer t' },
    })
    await expect(deleteApplication(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('forwards the delete to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 200,
      body: { tenant: 'acme', slug: 'loci', name: 'Loci', hosts: [], publicUrl: '', exposedProviders: [], status: 'deleted', createdAt: '2026-01-01T00:00:00Z' },
    })
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/applications/loci',
      params: { slug: 'acme', appSlug: 'loci' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    const response = await deleteApplication(event as any)
    expect(response.status).toBe(200)
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].url).toContain('/operator/tenants/acme/applications/loci')
  })
})
