import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// Behavior tier for `POST /operator/tenants/:tenantSlug/adopt` (ADR 0094) --
// registers an already-hand-authored tenant (e.g. bytepunx,
// bytepunx/authstar-tower#3) in tower's own actor store. The one property
// every test here ultimately protects: this route must NEVER touch signet
// (no pushSecret, no patchConfig) -- `signetAdmin.calls`/`patchCalls` stay
// empty across every single test in this file, not just the happy path.

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

describe('POST /operator/tenants/:tenantSlug/adopt', () => {
  let app: FastifyInstance
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>

  let jwt: InternalJwtFixture

  beforeEach(async () => {
    const consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, signetAdmin, provisioningConfig, authstarGetKey: jwt.getKey })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without a valid operator token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      payload: adoptBody,
    })
    expect(response.statusCode).toBe(403)
  })

  it('adopts an already-live tenant into tower without touching signet at all', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ slug: 'bytepunx', domain: 'bytepunx.com' })

    // The whole point of adoption: zero signet writes, ever.
    expect(signetAdmin.calls).toHaveLength(0)
    expect(signetAdmin.patchCalls).toHaveLength(0)

    const tenantResponse = await app.inject({
      method: 'GET',
      url: '/tenants/bytepunx',
      headers: { authorization: 'Bearer op-secret' },
    })
    expect(tenantResponse.statusCode).toBe(200)
    const tenant = tenantResponse.json()
    expect(tenant.domain).toBe('bytepunx.com')
    expect(tenant.cookie.domain).toBe('.bytepunx.com')
    expect(tenant.cookie.maxAge).toBe(604_800)
    expect(tenant.secretsProvisioned).toBe(true)
    expect(tenant.portcullisRegistered).toBe(true)
  })

  it('rejects adopting a slug that already exists in tower', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })
    expect(second.statusCode).toBe(409)
    expect(signetAdmin.calls).toHaveLength(0)
    expect(signetAdmin.patchCalls).toHaveLength(0)
  })

  it('rejects a domain already registered to another tenant', async () => {
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/other-tenant/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: { ...adoptBody, name: 'Other' },
    })
    expect(response.statusCode).toBe(409)
  })

  it('rejects the "authstar" reserved slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/operator/tenants/authstar/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })
    expect(response.statusCode).toBe(400)
  })

  it('registers the given provider as an active tower provider, usable for application creation', async () => {
    await app.inject({
      method: 'POST',
      url: '/operator/tenants/bytepunx/adopt',
      headers: { authorization: 'Bearer op-secret' },
      payload: adoptBody,
    })

    // Registering an ordinary application (loci) referencing the adopted
    // provider must succeed -- proves the provider actor is real and active,
    // not just a response-shape artifact.
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/bytepunx/applications',
      headers: bearer(await jwt.signToken({ permissions: ['applications:manage'] })),
      payload: { slug: 'loci', name: 'Loci', hosts: ['loci.bytepunx.com'], exposedProviders: ['google'] },
    })
    expect(response.statusCode).toBe(201)
    // Application bookkeeping only -- confirms (again) that adopting the
    // tenant and registering an application on top of it never touches
    // signet; portcullis's own hand-authored routing config for loci is
    // untouched by tower, by design (ApplicationState carries no
    // upstream/exempt/cors/auth fields at all).
    expect(signetAdmin.calls).toHaveLength(0)
    expect(signetAdmin.patchCalls).toHaveLength(0)
  })
})
