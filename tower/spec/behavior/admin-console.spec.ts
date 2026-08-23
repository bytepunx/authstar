import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin } from '../lib/fakes.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// ADR 0096: completes the `_admin` console for a tenant adopted via
// POST /operator/tenants/:tenantSlug/adopt (ADR 0094), which never creates
// one. The one property this whole route exists to guarantee: the portcullis
// patch is *scoped* to `/tenants/<slug>/applications/_admin` only -- never a
// whole-tenant replace -- so it never risks an adopted tenant's other
// hand-authored applications.

// defaultProvider is deliberately NOT "google" -- bytepunx's own registered
// provider (set up via `adopt`, below) -- to prove admin-console.ts uses the
// tenant's own registration, not tower's installation-wide default.
const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  operatorToken: 'op-secret',
  defaultProvider: { name: 'dex', clientId: 'client-1', discoveryUrl: 'https://dex.example/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'provider-secret-value',
}

const adoptBody = {
  name: 'Bytepunx',
  domain: 'bytepunx.com',
  cookieDomain: '.bytepunx.com',
  adminEmail: 'admin@bytepunx.com',
  provider: {
    name: 'google',
    clientId: '513214725544-v8vge1pndsdfkb0fm0bp09mel0272322.apps.googleusercontent.com',
    discoveryUrl: 'https://accounts.google.com',
    scope: ['openid', 'email'],
  },
}

describe('POST /operator/tenants/:tenantSlug/admin-console', () => {
  let app: FastifyInstance
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>

  beforeEach(async () => {
    const consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    app = await buildApp({ consequent, signetAdmin, provisioningConfig })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without a valid operator token', async () => {
    const response = await app.inject({ method: 'POST', url: '/operator/tenants/bytepunx/admin-console' })
    expect(response.statusCode).toBe(403)
  })

  it('returns 404 for a tenant that was never created', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('creates the _admin application and patches portcullis, scoped only to that one application', async () => {
    // Simulate an already-adopted tenant with a hand-authored applications
    // map already containing other apps -- exactly bytepunx's real shape.
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })
    signetAdmin.patchCalls.length = 0

    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ slug: 'bytepunx', adminHost: 'authstar.bytepunx.com' })

    // Exactly one patch, exactly one operation, scoped to the _admin app key
    // only -- never a whole-tenant replace.
    expect(signetAdmin.patchCalls).toHaveLength(1)
    const patch = signetAdmin.patchCalls[0]
    expect(patch.targetService).toBe('portcullis')
    expect(patch.operations).toHaveLength(1)
    expect(patch.operations[0].op).toBe('add')
    expect(patch.operations[0].path).toBe('/tenants/bytepunx/applications/_admin')
    const value = patch.operations[0].value as { hosts: string[], providers: string[] }
    expect(value.hosts).toEqual(['authstar.bytepunx.com'])
    // The tenant's own registered provider ("google", from `adopt`) -- not
    // provisioningConfig.defaultProvider, which this fixture deliberately
    // sets to something else below to prove the distinction.
    expect(value.providers).toEqual(['google'])

    // Zero secret pushes -- this route (like adopt) never touches signet
    // secrets, only tower's own bookkeeping and a scoped config patch.
    expect(signetAdmin.calls).toHaveLength(0)
  })

  it('uses the tenant\'s own registered provider, not the installation-wide default', async () => {
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(201)

    const patch = signetAdmin.patchCalls[0]
    const value = patch.operations[0].value as { providers: string[] }
    // provisioningConfig.defaultProvider.name is "dex" in this fixture
    // (below) -- if this route used that instead of bytepunx's own "google"
    // registration, the admin console would have zero working login
    // providers.
    expect(value.providers).not.toContain('dex')
    expect(value.providers).toEqual(['google'])
  })

  it('self-corrects the portcullis patch on retry, even though the tower application already exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    signetAdmin.patchCalls.length = 0

    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(200)
    // Still re-sent, not skipped -- this is what makes the route
    // self-healing if the providers list was ever wrong (exactly what
    // happened live: an earlier version of this route used
    // provisioningConfig.defaultProvider instead of the tenant's own
    // registration).
    expect(signetAdmin.patchCalls).toHaveLength(1)
  })

  it('rejects a domain-pending tenant (no domain to build an admin host from)', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'pending', name: 'Pending', adminEmail: 'admin@pending.test' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/pending/admin-console',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(response.statusCode).toBe(409)
  })
})
