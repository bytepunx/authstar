import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { constants, generateKeyPairSync, privateDecrypt, createDecipheriv } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { EncryptedEnvelope } from '../../src/lib/herald-payload-crypto.js'

// Same standalone-reimplementation decrypt proof `provisioning.spec.ts`
// already established for this exact envelope format.
function decryptLikeHerald(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], envelope: EncryptedEnvelope): unknown {
  const aesKey = privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(envelope.wrappedKey, 'base64'),
  )
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

// Behavior tier: the general-purpose (non-bootstrap) half of design/
// stories/tower/007-invites-and-invite-codes.md's "Issuance and
// Management" section, for token-based `invite`.

describe('invites -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>
  let jwt: InternalJwtFixture
  let headers: { authorization: string }
  let heraldPrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey']

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    jwt = await createInternalJwtFixture()
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    heraldPrivateKey = privateKey
    app = await buildApp({ consequent, publisher, authstarGetKey: jwt.getKey, heraldPayloadKey: { version: 1, publicKey } })
    headers = bearer(await jwt.signToken({ permissions: ['invite:send'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, domain: `${slug}.test`, cookieDomain: `${slug}.test`, createdBy: 't' })
  }

  async function createContact(tenantSlug: string, email: string) {
    return app.contactStore.upsert(tenantSlug, email)
  }

  async function createActiveRoleDefinition(tenantSlug: string, name: string, scope: 'tenant' | { application: string } = 'tenant') {
    const key = scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
    await consequent.handle(key, 'roleDefinition.create', { tenant: tenantSlug, name, scope, description: '' })
  }

  describe('POST /tenants/:tenantSlug/invites', () => {
    it('returns 404 for a tenant that was never created', async () => {
      const response = await app.inject({
        method: 'POST', url: '/tenants/nonexistent/invites', headers, payload: { contactId: 'c-1' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('creates a pending invite and publishes a decryptable comms.transactional.invite-sent', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: contact.id },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.token).toBeTruthy()
      expect(body.status).toBe('pending')
      expect(body.tenant).toBe('acme')

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0].routingKey).toBe('comms.transactional.invite-sent')
      const payload = publisher.calls[0].payload as { encryptedPayload: string, contactId: string }
      expect(payload.contactId).toBe(contact.id)
      const decrypted = decryptLikeHerald(heraldPrivateKey, JSON.parse(payload.encryptedPayload)) as { to: string, templateData: Record<string, unknown> }
      expect(decrypted.to).toBe('invitee@acme.test')
      expect(decrypted.templateData).toMatchObject({ tenant: { name: 'Acme' }, token: body.token, adminHost: 'authstar.acme.test' })

      const invite = await consequent.fetch('invite', body.token)
      expect(invite!.state.contactId).toBe(contact.id)
    })

    it('accepts an email for a never-before-seen invitee, find-or-creating the contact (ADR 0091)', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: undefined, email: 'brand-new@acme.test' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(publisher.calls).toHaveLength(1)
      const payload = publisher.calls[0].payload as { contactId: string }
      expect(payload.contactId).toBeTruthy()

      const invite = await consequent.fetch('invite', body.token)
      expect(invite!.state.contactId).toBe(payload.contactId)

      const contact = await app.contactStore.findByEmail('acme', 'brand-new@acme.test')
      expect(contact?.id).toBe(payload.contactId)
    })

    it('rejects a body with neither contactId nor email', async () => {
      await createTenant('acme')
      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    })

    it('resolves the invite-sent host from the target application\'s own hosts when application is set', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')
      await consequent.handle('acme:billing', 'application.create', {
        tenant: 'acme', slug: 'billing', name: 'Billing', hosts: ['billing.acme.authstar.app'], publicUrl: '', exposedProviders: [],
      })

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: contact.id, application: 'billing' },
      })

      expect(response.statusCode).toBe(201)
      const payload = publisher.calls[0].payload as { encryptedPayload: string }
      const decrypted = decryptLikeHerald(heraldPrivateKey, JSON.parse(payload.encryptedPayload)) as { templateData: Record<string, unknown> }
      expect(decrypted.templateData.adminHost).toBe('billing.acme.authstar.app')
    })

    it('rejects a role not backed by an active role definition', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: contact.id, roles: [{ name: 'admin', scope: 'tenant' }] },
      })
      expect(response.statusCode).toBe(400)
      expect(publisher.calls).toHaveLength(0)
    })

    it('accepts a role backed by an active role definition', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')
      await createActiveRoleDefinition('acme', 'admin')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: contact.id, roles: [{ name: 'admin', scope: 'tenant' }] },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().roles).toEqual([{ name: 'admin', scope: 'tenant' }])
    })

    it('accepts an elevated permissions array (the bootstrap case)', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')

      const response = await app.inject({
        method: 'POST',
        url: '/tenants/acme/invites',
        headers,
        payload: { contactId: contact.id, permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }] },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().permissions).toEqual([{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }])
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'POST', url: '/tenants/acme/invites', payload: { contactId: 'c-1' } })
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /tenants/:tenantSlug/invites', () => {
    // A dedicated tenant slug, not reused by any other `it()` in this file
    // -- see `invite-codes.spec.ts`'s own comment on its analogous list
    // test for why (consequent's default in-memory search adapter is a
    // module-level singleton shared across every `buildInMemoryConsequent()`
    // call in this process; `find()` would otherwise also return invites
    // created by earlier tests reusing `acme`).
    it('lists invites for a tenant, filterable by status', async () => {
      await createTenant('invitelist-1')
      const contact = await createContact('invitelist-1', 'invitee@acme.test')
      const created = await app.inject({ method: 'POST', url: '/tenants/invitelist-1/invites', headers, payload: { contactId: contact.id } })
      await app.inject({ method: 'DELETE', url: `/tenants/invitelist-1/invites/${created.json().token}`, headers })

      const all = await app.inject({ method: 'GET', url: '/tenants/invitelist-1/invites' })
      expect((all.json() as unknown[])).toHaveLength(1)

      const revokedOnly = await app.inject({ method: 'GET', url: '/tenants/invitelist-1/invites?status=revoked' })
      expect((revokedOnly.json() as Array<{ status: string }>).map((i) => i.status)).toEqual(['revoked'])

      const pendingOnly = await app.inject({ method: 'GET', url: '/tenants/invitelist-1/invites?status=pending' })
      expect(pendingOnly.json()).toEqual([])
    })
  })

  describe('GET /tenants/:tenantSlug/invites/:token', () => {
    it('returns 404 for a nonexistent token', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/invites/nonexistent' })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for a cross-tenant token lookup', async () => {
      await createTenant('acme')
      await createTenant('other')
      const contact = await createContact('acme', 'invitee@acme.test')
      const created = await app.inject({ method: 'POST', url: '/tenants/acme/invites', headers, payload: { contactId: contact.id } })

      const response = await app.inject({ method: 'GET', url: `/tenants/other/invites/${created.json().token}` })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /tenants/:tenantSlug/invites/:token', () => {
    it('revokes a pending invite', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')
      const created = await app.inject({ method: 'POST', url: '/tenants/acme/invites', headers, payload: { contactId: contact.id } })

      const response = await app.inject({
        method: 'PATCH', url: `/tenants/acme/invites/${created.json().token}`, headers, payload: { status: 'revoked' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects revoking an already-revoked invite', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')
      const created = await app.inject({ method: 'POST', url: '/tenants/acme/invites', headers, payload: { contactId: contact.id } })
      await app.inject({ method: 'PATCH', url: `/tenants/acme/invites/${created.json().token}`, headers, payload: { status: 'revoked' } })

      const response = await app.inject({
        method: 'PATCH', url: `/tenants/acme/invites/${created.json().token}`, headers, payload: { status: 'revoked' },
      })
      expect(response.statusCode).toBe(409)
    })
  })

  describe('DELETE /tenants/:tenantSlug/invites/:token', () => {
    it('is idempotent on a retry against an already-revoked invite', async () => {
      await createTenant('acme')
      const contact = await createContact('acme', 'invitee@acme.test')
      const created = await app.inject({ method: 'POST', url: '/tenants/acme/invites', headers, payload: { contactId: contact.id } })

      await app.inject({ method: 'DELETE', url: `/tenants/acme/invites/${created.json().token}`, headers })
      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/invites/${created.json().token}`, headers })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('revoked')
    })

    it('rejects with 403 when no bearer token is presented', async () => {
      await createTenant('acme')
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/invites/whatever' })
      expect(response.statusCode).toBe(403)
    })
  })
})
