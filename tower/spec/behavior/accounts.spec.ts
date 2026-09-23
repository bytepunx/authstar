import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: `POST /tenants/:tenantSlug/accounts/:accountId/change-email`
// (ADR 0076) -- repoints `account.contactId` to a new/reused contact
// record and triggers ADR 0024's existing `herald.contact.migrated`
// carry-forward mechanism for the first time. No `POST /accounts` route
// exists in this repo (Story 005 -- accounts are only ever created via
// `/identities/resolve`), so tests create the account directly via
// `consequent.handle()`, same convention the e2e tier already uses for
// routes that don't exist yet.

describe('POST /tenants/:tenantSlug/accounts/:accountId/change-email', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, publisher, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['accounts:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function createAccount(accountId: string, tenant: string, contactId: string) {
    await consequent.handle(accountId, 'account.create', { accountId, tenant, contactId })
  }

  it('returns 404 for an account that was never created', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/nonexistent/change-email',
      headers,
      payload: { newEmail: 'new@acme.test' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 404 for a cross-tenant account id', async () => {
    await createAccount('acct-1', 'acme', await app.contactStore.upsert('acme', 'old@acme.test').then((c) => c.id))
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/other-tenant/accounts/acct-1/change-email',
      headers,
      payload: { newEmail: 'new@acme.test' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('repoints account.contactId to the new email\'s contact and publishes herald.contact.migrated', async () => {
    const oldContact = await app.contactStore.upsert('acme', 'old@acme.test')
    await createAccount('acct-1', 'acme', oldContact.id)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      headers,
      payload: { newEmail: 'new@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    const newContactId = app.contactStore.computeId('acme', 'new@acme.test')
    expect(response.json().contactId).toBe(newContactId)
    expect(newContactId).not.toBe(oldContact.id)

    const account = await consequent.fetch('account', 'acct-1')
    expect(account!.state.contactId).toBe(newContactId)

    expect(publisher.calls).toHaveLength(1)
    expect(publisher.calls[0]).toEqual({
      routingKey: 'herald.contact.migrated',
      payload: { tenant: 'acme', oldContactId: oldContact.id, newContactId },
    })
  })

  it('reuses an existing contact record for an already-known email, rather than creating a duplicate', async () => {
    const oldContact = await app.contactStore.upsert('acme', 'old@acme.test')
    const existingContact = await app.contactStore.upsert('acme', 'existing@acme.test')
    await createAccount('acct-1', 'acme', oldContact.id)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      headers,
      payload: { newEmail: 'existing@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().contactId).toBe(existingContact.id)
    expect(publisher.calls[0].payload).toMatchObject({ newContactId: existingContact.id })
  })

  it('is a no-op, publishing nothing, when newEmail resolves to the account\'s current contact', async () => {
    const contact = await app.contactStore.upsert('acme', 'same@acme.test')
    await createAccount('acct-1', 'acme', contact.id)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      headers,
      payload: { newEmail: 'same@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().contactId).toBe(contact.id)
    expect(publisher.calls).toHaveLength(0)
  })

  it('rejects with 403 when no bearer token is presented (Story 014)', async () => {
    const oldContact = await app.contactStore.upsert('acme', 'old@acme.test')
    await createAccount('acct-1', 'acme', oldContact.id)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      payload: { newEmail: 'new@acme.test' },
    })
    expect(response.statusCode).toBe(403)
    expect(publisher.calls).toHaveLength(0)
  })

  it('rejects with 403 for a token with an unrelated grant, not accounts:manage', async () => {
    const oldContact = await app.contactStore.upsert('acme', 'old@acme.test')
    await createAccount('acct-1', 'acme', oldContact.id)

    const wrongHeaders = bearer(await jwt.signToken({ permissions: ['billing:manage'] }))
    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      headers: wrongHeaders,
      payload: { newEmail: 'new@acme.test' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a missing newEmail at the schema level (400)', async () => {
    const oldContact = await app.contactStore.upsert('acme', 'old@acme.test')
    await createAccount('acct-1', 'acme', oldContact.id)

    const response = await app.inject({
      method: 'POST',
      url: '/tenants/acme/accounts/acct-1/change-email',
      headers,
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })
})
