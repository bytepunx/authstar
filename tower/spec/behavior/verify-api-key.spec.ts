import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createInMemoryContactStore, type ContactStore } from '../../src/lib/contact-store.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: design/decisions/0101-api-keys.md's `POST /verify-api-key`
// -- the API-key analogue of `enrich.spec.ts`. Keys are created here
// directly against the `apiKey` actor (not through `routes/api-keys.ts`,
// which has its own dedicated spec) so each test controls the exact
// `hashedSecret`/`salt`/`grantedRoles` under test.

describe('POST /verify-api-key', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let contactStore: ContactStore

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    contactStore = createInMemoryContactStore()
    app = await buildApp({ consequent, contactStore })
  })

  afterEach(async () => {
    await app.close()
  })

  async function seedAccount(accountId: string, tenantSlug: string, email: string, grantedRoles: Array<{ name: string, scope: 'tenant' | { application: string } }> = []) {
    const contact = await contactStore.upsert(tenantSlug, email)
    await consequent.handle(accountId, 'account.create', { accountId, tenant: tenantSlug, contactId: contact.id })
    for (const role of grantedRoles) {
      await consequent.handle(accountId, 'account.grant-role', { role })
    }
  }

  async function seedOrganization(organizationId: string, tenantSlug: string, grantedRoles: Array<{ application: string, role: string }> = []) {
    await consequent.handle(organizationId, 'organization.create', { organizationId, tenant: tenantSlug, name: organizationId })
    for (const role of grantedRoles) {
      await consequent.handle(organizationId, 'organization.grant-role', { role })
    }
  }

  async function seedApiKey(apiKeyId: string, opts: {
    tenant: string
    application: string
    owner: { account: string } | { organization: string }
    grantedRoles: string[]
    secret: string
  }) {
    const { hashApiKeySecret, generateApiKeySalt } = await import('../../src/lib/api-key-secret.js')
    const salt = generateApiKeySalt()
    const hashedSecret = hashApiKeySecret(opts.secret, salt)
    await consequent.handle(apiKeyId, 'apiKey.create', {
      apiKeyId, tenant: opts.tenant, application: opts.application, name: 'test key',
      owner: opts.owner, grantedRoles: opts.grantedRoles, createdBy: 'acct-creator',
      hashedSecret, salt, secretPreview: opts.secret.slice(-4),
    })
  }

  it('denies an unknown apiKeyId', async () => {
    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'nonexistent', secret: 'whatever' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('denies a wrong secret', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'wrong-secret' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('denies a revoked key even with the right secret', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })
    await consequent.handle('apikey-1', 'apiKey.revoke', {})

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('denies a cross-tenant verify attempt', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'other-tenant', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('allows a valid personal key and resolves the owning account\'s real email as sub', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.outcome).toBe('allow')
    expect(body.apiKeyId).toBe('apikey-1')
    expect(body.sub).toBe('admin@example.com')
    expect(body.accountId).toBe('acct-1')
    expect(body.grantedRoles).toEqual(['read'])
    expect(body.permissions).toEqual([])
    expect(body.trialRoles).toEqual([])
    expect(body.trialExpiresAt).toBeNull()
  })

  it('re-intersects grantedRoles against the owner\'s live current roles, never trusting the key\'s own ceiling alone', async () => {
    // Key was created while the account held both 'read' and 'write'; 'write' was since revoked
    // from the account directly (e.g. a plan lapse) without ever touching the key record.
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read', 'write'], secret: 'right-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().grantedRoles).toEqual(['read'])
  })

  it('denies once the owning account is suspended', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })
    await consequent.handle('acct-1', 'account.suspend', {})

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('allows an org-owned key and gives it a synthetic, non-deliverable sub', async () => {
    await seedOrganization('org-1', 'acme', [{ application: 'app1', role: 'read' }])
    await seedApiKey('apikey-2', { tenant: 'acme', application: 'app1', owner: { organization: 'org-1' }, grantedRoles: ['read'], secret: 'org-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-2', secret: 'org-secret' },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sub).toBe('apikey:apikey-2')
    expect(body.accountId).toBeUndefined()
    expect(body.grantedRoles).toEqual(['read'])
  })

  it('re-intersects an org-owned key\'s roles against the organization\'s own live grantedRoles', async () => {
    await seedOrganization('org-1', 'acme', [{ application: 'app1', role: 'read' }])
    await seedApiKey('apikey-2', { tenant: 'acme', application: 'app1', owner: { organization: 'org-1' }, grantedRoles: ['read', 'write'], secret: 'org-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-2', secret: 'org-secret' },
    })
    expect(response.json().grantedRoles).toEqual(['read'])
  })

  it('returns the owner\'s apiKeyRateLimit alongside the allow outcome', async () => {
    await seedAccount('acct-1', 'acme', 'admin@example.com', [{ name: 'read', scope: { application: 'app1' } }])
    await consequent.handle('acct-1', 'account.set-api-key-rate-limit', { apiKeyRateLimit: { requestsPerMinute: 60, burst: 10 } })
    await seedApiKey('apikey-1', { tenant: 'acme', application: 'app1', owner: { account: 'acct-1' }, grantedRoles: ['read'], secret: 'right-secret' })

    const response = await app.inject({
      method: 'POST', url: '/verify-api-key',
      payload: { tenant: 'acme', application: 'app1', apiKeyId: 'apikey-1', secret: 'right-secret' },
    })
    expect(response.json().rateLimit).toEqual({ requestsPerMinute: 60, burst: 10 })
  })
})
