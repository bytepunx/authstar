import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import { UnsubscribeKeyring, issueToken } from '../../src/lib/unsubscribe-token.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// Behavior tier: design/stories/herald/001-actor-definitions.md's
// "Unsubscribe Token" section.

describe('unsubscribe -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let unsubscribeKeyring: UnsubscribeKeyring
  let jwt: InternalJwtFixture
  // Only the opt-outs GET calls below (used to verify the unsubscribe
  // flow's side effect) go through `requirePermission` -- `/unsubscribe`
  // itself is a public, token-authenticated route, never gated by this
  // middleware, so it deliberately gets no headers anywhere in this file.
  let optOutsHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    unsubscribeKeyring = new UnsubscribeKeyring()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, unsubscribeKeyring, authstarGetKey: jwt.getKey })
    optOutsHeaders = bearer(await jwt.signToken({ permissions: ['opt-outs:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /unsubscribe', () => {
    it('confirms a valid token without performing the opt-out (no side effect)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const token = issueToken(unsubscribeKeyring, tenant, contactId, 'newsletter')

      const response = await app.inject({ method: 'GET', url: `/unsubscribe?token=${encodeURIComponent(token)}` })
      expect(response.statusCode).toBe(200)
      expect(response.json().confirmed).toBe(false)

      const optOuts = await app.inject({ headers: optOutsHeaders, method: 'GET', url: `/tenants/${tenant}/opt-outs/${contactId}` })
      expect(optOuts.json().optedOutCategories).toEqual([])
    })

    it('rejects an invalid token (400)', async () => {
      const response = await app.inject({ method: 'GET', url: '/unsubscribe?token=garbage' })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /unsubscribe', () => {
    it('performs the opt-out for a valid token', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const token = issueToken(unsubscribeKeyring, tenant, contactId, 'newsletter')

      const response = await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
      expect(response.statusCode).toBe(200)
      expect(response.json().confirmed).toBe(true)

      const optOuts = await app.inject({ headers: optOutsHeaders, method: 'GET', url: `/tenants/${tenant}/opt-outs/${contactId}` })
      expect(optOuts.json().optedOutCategories).toEqual(['newsletter'])
    })

    it('is one-shot idempotent -- posting the same token twice is not an error', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const token = issueToken(unsubscribeKeyring, tenant, contactId, 'newsletter')

      await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
      const second = await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
      expect(second.statusCode).toBe(200)
    })

    it('rejects a token signed with a since-pruned key generation (fails closed)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const token = issueToken(unsubscribeKeyring, tenant, contactId, 'newsletter')
      const version = unsubscribeKeyring.current()
      unsubscribeKeyring.prune(version)

      const response = await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
      expect(response.statusCode).toBe(400)
    })

    it('a token signed under an older key generation still verifies after rotation (checks every generation held)', async () => {
      const tenant = uniqueSlug('acme')
      const contactId = uniqueSlug('contact')
      const token = issueToken(unsubscribeKeyring, tenant, contactId, 'newsletter')
      unsubscribeKeyring.rotate()

      const response = await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
      expect(response.statusCode).toBe(200)
    })
  })
})
