import { describe, expect, it } from 'vitest'
import { GET as listAccounts } from '../../src/routes/api/tenants/[slug]/accounts/+server.js'
import { POST as grantPermission } from '../../src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/+server.js'
import { DELETE as revokePermission } from '../../src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/[grant]/+server.js'
import { POST as createInvite } from '../../src/routes/api/tenants/[slug]/invites/+server.js'
import { fakeEvent, readJson } from '../helpers/fake-event.js'
import { capturingFakeFetch, makeFakeFetch } from '../helpers/fake-fetch.js'

// Story 003: Admin Access (read, recovery grant/revoke, bootstrap invite).

describe('GET /api/tenants/:slug/accounts', () => {
  it('forwards an email search to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 200, body: [] })
    const event = fakeEvent({
      path: '/api/tenants/acme/accounts?email=a%40acme.test',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      fetchImpl,
    })
    await listAccounts(event as any)
    expect(calls[0].url).toContain('/operator/tenants/acme/accounts')
    expect(calls[0].url).toContain('email=a%40acme.test')
  })
})

describe('POST /api/tenants/:slug/accounts/:accountId/permissions (grant)', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/accounts/acc-1/permissions',
      params: { slug: 'acme', accountId: 'acc-1' },
      headers: { authorization: 'Bearer t' },
      body: { grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null },
    })
    await expect(grantPermission(event as any)).rejects.toMatchObject({ status: 400 })
  })

  // Real tower shape (routes/accounts.ts's permissionBodySchema):
  // {grant, scope, maxOutstanding} -- not {application, role}.
  it('forwards the grant body to tower', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({
      status: 200,
      body: { id: 'acc-1', permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }] },
    })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/accounts/acc-1/permissions',
      params: { slug: 'acme', accountId: 'acc-1' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null },
      fetchImpl,
    })
    const response = await grantPermission(event as any)
    expect(response.status).toBe(200)
    expect(calls[0].url).toContain('/operator/tenants/acme/accounts/acc-1/permissions')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null })
  })
})

describe('DELETE .../permissions/:grant (revoke)', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/accounts/acc-1/permissions/tenant%3Amanage?scope=tenant',
      params: { slug: 'acme', accountId: 'acc-1', grant: 'tenant:manage' },
      headers: { authorization: 'Bearer t' },
    })
    await expect(revokePermission(event as any)).rejects.toMatchObject({ status: 400 })
  })

  // Real tower contract (routes/accounts.ts's removalQuerySchema): scope
  // travels as a query string (`?scope=tenant` or `?applicationScope=`),
  // not encoded into the grant path segment.
  it('calls DELETE on the specific grant path, forwarding tenant scope as a query param', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 204 })
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/accounts/acc-1/permissions/tenant%3Amanage?scope=tenant',
      params: { slug: 'acme', accountId: 'acc-1', grant: 'tenant:manage' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    const response = await revokePermission(event as any)
    expect(response.status).toBe(204)
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].url).toContain('/permissions/tenant%3Amanage')
    expect(calls[0].url).toContain('scope=tenant')
  })

  it('forwards an application scope as applicationScope, not the tenant fallback', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 204 })
    const event = fakeEvent({
      method: 'DELETE',
      path: '/api/tenants/acme/accounts/acc-1/permissions/billing%3Aread?applicationScope=billing',
      params: { slug: 'acme', accountId: 'acc-1', grant: 'billing:read' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      fetchImpl,
    })
    await revokePermission(event as any)
    expect(calls[0].url).toContain('applicationScope=billing')
    expect(calls[0].url).not.toContain('scope=tenant')
  })
})

describe('POST /api/tenants/:slug/invites (bootstrap)', () => {
  it('requires X-Operator-Actor', async () => {
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/invites',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t' },
      body: { email: 'new@acme.test', application: null, permissions: [] },
    })
    await expect(createInvite(event as any)).rejects.toMatchObject({ status: 400 })
  })

  it('forwards the invite body and returns tower response', async () => {
    const fetchImpl = makeFakeFetch(() => ({ status: 201, body: { id: 'inv-1', email: 'new@acme.test' } }))
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/invites',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: { email: 'new@acme.test', application: null, permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }] },
      fetchImpl,
    })
    const response = await createInvite(event as any)
    const body = (await readJson(response)) as { id: string }
    expect(body.id).toBe('inv-1')
  })

  // Tower's real permission-grant shape (routes/invites.ts's
  // permissionSchema, and routes/accounts.ts's permissionBodySchema --
  // both {grant, scope, maxOutstanding}, the same PermissionGrant type
  // steward's own accounts grant/revoke flow uses too).
  it('forwards tower-shaped permission grants unmodified', async () => {
    const { fetchImpl, calls } = capturingFakeFetch({ status: 201, body: { id: 'inv-2', email: 'admin@acme.test' } })
    const event = fakeEvent({
      method: 'POST',
      path: '/api/tenants/acme/invites',
      params: { slug: 'acme' },
      headers: { authorization: 'Bearer t', 'x-operator-actor': 'alice' },
      body: {
        email: 'admin@acme.test',
        application: null,
        permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }],
      },
      fetchImpl,
    })
    await createInvite(event as any)
    const sentBody = JSON.parse(calls[0].init?.body as string)
    expect(sentBody.permissions).toEqual([{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }])
  })
})
