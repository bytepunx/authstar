import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier: design/stories/herald/004-communication-history-opt-outs-and-suppressions.md's
// opt-out routes.

describe('opt-outs -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /tenants/:tenantSlug/opt-outs/:contactId', () => {
    it('returns an empty list for a contact with no opt-outs -- not a 404', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({ method: 'GET', url: `/tenants/${tenant}/opt-outs/${contactId}` })
      expect(response.statusCode).toBe(200)
      expect(response.json().optedOutCategories).toEqual([])
    })
  })

  describe('POST /tenants/:tenantSlug/opt-outs/:contactId/categories', () => {
    it('adds a category', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({
        method: 'POST',
        url: `/tenants/${tenant}/opt-outs/${contactId}/categories`,
        payload: { category: 'newsletter' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().optedOutCategories).toEqual(['newsletter'])
    })

    it('adding the same category twice is idempotent, not an error', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/opt-outs/${contactId}/categories`, payload: { category: 'newsletter' } })
      const response = await app.inject({ method: 'POST', url: `/tenants/${tenant}/opt-outs/${contactId}/categories`, payload: { category: 'newsletter' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().optedOutCategories).toEqual(['newsletter'])
    })

    it('accumulates multiple distinct categories', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/opt-outs/${contactId}/categories`, payload: { category: 'newsletter' } })
      const response = await app.inject({ method: 'POST', url: `/tenants/${tenant}/opt-outs/${contactId}/categories`, payload: { category: 'promotions' } })
      expect(response.json().optedOutCategories.sort()).toEqual(['newsletter', 'promotions'])
    })
  })

  describe('DELETE /tenants/:tenantSlug/opt-outs/:contactId/categories/:category', () => {
    it('removes a category -- real deletion, not a status flip', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      await app.inject({ method: 'POST', url: `/tenants/${tenant}/opt-outs/${contactId}/categories`, payload: { category: 'newsletter' } })

      const response = await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/opt-outs/${contactId}/categories/newsletter` })
      expect(response.statusCode).toBe(200)
      expect(response.json().optedOutCategories).toEqual([])
    })

    it('returns 404 for a contact with no opt-out record at all', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const response = await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/opt-outs/${contactId}/categories/newsletter` })
      expect(response.statusCode).toBe(404)
    })
  })
})
