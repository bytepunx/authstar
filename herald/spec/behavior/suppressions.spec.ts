import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: design/stories/herald/004-communication-history-opt-outs-and-suppressions.md's
// suppression routes.

describe('suppressions -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /tenants/:tenantSlug/suppressions', () => {
    it('creates a manual suppression', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/${tenant}/suppressions`,
        payload: { contactId, reason: 'manual' },
      })
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.reason).toBe('manual')
      expect(body.contactId).toBe(contactId)
    })

    it('defaults reason to "manual" when omitted', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })
      expect(response.json().reason).toBe('manual')
    })

    it('rejects "hard-bounce"/"complaint" as client-supplied reasons at the schema level (400)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/${tenant}/suppressions`,
        payload: { contactId, reason: 'hard-bounce' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('rejects creating a suppression for an already-suppressed contact (409)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })
      const response = await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })
      expect(response.statusCode).toBe(409)
    })
  })

  describe('GET /tenants/:tenantSlug/suppressions', () => {
    it('lists suppressions for the tenant', async () => {
      const tenant = uniqueSlug('acme')
      const contactA = uniqueSlug('contact-a')
      const contactB = uniqueSlug('contact-b')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId: contactA } })
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId: contactB } })

      const response = await app.inject({ method: 'GET', url: `/tenants/${tenant}/suppressions` })
      expect(response.json()).toHaveLength(2)
    })

    it('filters by reason', async () => {
      const tenant = uniqueSlug('acme')
      const contactA = uniqueSlug('contact-a')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId: contactA, reason: 'manual' } })

      const response = await app.inject({ method: 'GET', url: `/tenants/${tenant}/suppressions?reason=manual` })
      expect(response.json()).toHaveLength(1)

      const noneMatch = await app.inject({ method: 'GET', url: `/tenants/${tenant}/suppressions?reason=complaint` })
      expect(noneMatch.json()).toHaveLength(0)
    })
  })

  describe('DELETE /tenants/:tenantSlug/suppressions/:contactId', () => {
    it('removes the suppression outright -- real DELETE', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })

      const response = await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/suppressions/${contactId}` })
      expect(response.statusCode).toBe(204)

      const list = await app.inject({ method: 'GET', url: `/tenants/${tenant}/suppressions` })
      expect(list.json()).toHaveLength(0)
    })

    it('a suppression can be re-created after removal (no lingering "already suppressed" state)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })
      await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/suppressions/${contactId}` })

      const response = await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })
      expect(response.statusCode).toBe(201)
    })

    it('returns 404 for a contact that was never suppressed', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/suppressions/${contactId}` })
      expect(response.statusCode).toBe(404)
    })
  })
})
