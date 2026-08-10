import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for tower's producer/tracking role in the erasure cascade
// (Story 008, ADR 0026/0040): contact lookup/rename, and the
// `DELETE .../contacts/:contactId` erasure trigger -- real contact-store
// removal, `erasureRequest` actor creation, and `contact.purged { tenant,
// contactId, accountId }` publish.

describe('contacts + erasure', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    app = await buildApp({ consequent, publisher })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /tenants/:tenantSlug/contacts', () => {
    it('returns 404 for an email with no contact', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/contacts?email=nobody@acme.test' })
      expect(response.statusCode).toBe(404)
    })

    it('looks up a single contact by email, never a list', async () => {
      await app.contactStore.upsert('acme', 'person@acme.test', 'Person')
      const response = await app.inject({ method: 'GET', url: '/tenants/acme/contacts?email=person@acme.test' })
      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Person')
    })
  })

  describe('PATCH /tenants/:tenantSlug/contacts/:contactId', () => {
    it('renames a contact', async () => {
      const contact = await app.contactStore.upsert('acme', 'person@acme.test', 'Old Name')
      const response = await app.inject({
        method: 'PATCH',
        url: `/tenants/acme/contacts/${contact.id}`,
        payload: { name: 'New Name' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('New Name')
    })
  })

  describe('DELETE /tenants/:tenantSlug/contacts/:contactId (erasure trigger)', () => {
    it('removes the contact row, creates a tracking erasureRequest, and publishes contact.purged', async () => {
      const contact = await app.contactStore.upsert('acme', 'person@acme.test')
      await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: contact.id })

      const response = await app.inject({ method: 'DELETE', url: `/tenants/acme/contacts/${contact.id}` })
      expect(response.statusCode).toBe(202)
      expect(response.json().status).toBe('pending')

      const gone = await app.contactStore.findById(contact.id)
      expect(gone).toBeNull()

      const erasureRequest = await consequent.fetch('erasureRequest', contact.id)
      expect(erasureRequest!.state.status).toBe('pending')
      expect(erasureRequest!.state.accountId).toBe('acct-1')

      expect(publisher.calls).toHaveLength(1)
      expect(publisher.calls[0]).toEqual({
        routingKey: 'contact.purged',
        payload: { tenant: 'acme', contactId: contact.id, accountId: 'acct-1' },
      })

      // account/identity are untouched -- contactId becomes a dangling pointer
      const account = await consequent.fetch('account', 'acct-1')
      expect(account!.state.contactId).toBe(contact.id)
      expect(account!.state.status).toBe('active')
    })

    it('publishes accountId: null when no account references the erased contact', async () => {
      const contact = await app.contactStore.upsert('acme', 'orphan@acme.test')
      await app.inject({ method: 'DELETE', url: `/tenants/acme/contacts/${contact.id}` })
      expect(publisher.calls[0].payload).toMatchObject({ accountId: null })
    })

    it('returns 404 for an already-erased (or never-existing) contact', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/tenants/acme/contacts/nonexistent' })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /tenants/:tenantSlug/erasure-requests/:contactId', () => {
    it('reports pending status with expectedServices alongside acknowledgedBy', async () => {
      const contact = await app.contactStore.upsert('acme', 'person@acme.test')
      await app.inject({ method: 'DELETE', url: `/tenants/acme/contacts/${contact.id}` })

      const response = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact.id}` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('pending')
      expect(body.acknowledgedBy).toEqual([])
      expect(body.expectedServices).toEqual(['herald', 'keep'])
    })

    it('flips to completed once every expected service has acknowledged', async () => {
      const contact = await app.contactStore.upsert('acme', 'person@acme.test')
      await app.inject({ method: 'DELETE', url: `/tenants/acme/contacts/${contact.id}` })

      await consequent.handle(contact.id, 'erasureRequest.acknowledge', { service: 'herald' })
      let response = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact.id}` })
      expect(response.json().status).toBe('pending')

      await consequent.handle(contact.id, 'erasureRequest.acknowledge', { service: 'keep' })
      response = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact.id}` })
      expect(response.json().status).toBe('completed')
      expect(response.json().acknowledgedBy.sort()).toEqual(['herald', 'keep'])
    })
  })
})
