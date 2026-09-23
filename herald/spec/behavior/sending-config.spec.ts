import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// Behavior tier: design/stories/herald/005-webhooks-config-rotation-and-activity.md's
// sending-config routes (webhook/key-rotation/activity themselves are
// deliberately out of scope for this slice -- see TESTING.md).

describe('sending config -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let jwt: InternalJwtFixture
  let headers: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['sending-config:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /tenants/:tenantSlug/sending-config', () => {
    it('returns 404 before any PATCH has ever established the singleton', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/sending-config` })
      expect(response.statusCode).toBe(404)
    })

    it('never returns credential/webhookSecret', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/sending-config`,
        payload: { provider: 'ses', fromAddress: 'noreply@acme.test', credential: 'top-secret' },
      })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/sending-config` })
      const body = response.json()
      expect(body.credential).toBeUndefined()
      expect(body.webhookSecret).toBeUndefined()
      expect(body.fromAddress).toBe('noreply@acme.test')
    })
  })

  describe('PATCH /tenants/:tenantSlug/sending-config', () => {
    it('the first PATCH establishes the singleton', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/sending-config`,
        payload: { provider: 'smtp', fromAddress: 'hello@acme.test', physicalAddress: '123 Main St' },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.tenant).toBe(tenant)
      expect(body.provider).toBe('smtp')
      expect(body.physicalAddress).toBe('123 Main St')
    })

    it('a later PATCH edits, not replaces -- unspecified fields survive', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/sending-config`, payload: { fromAddress: 'hello@acme.test', fromName: 'Acme' } })

      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/sending-config`, payload: { fromAddress: 'updated@acme.test' } })
      expect(response.json().fromAddress).toBe('updated@acme.test')
      expect(response.json().fromName).toBe('Acme')
    })

    it('routes credential/webhookSecret to the credential store, never to actor state', async () => {
      const tenant = uniqueSlug('acme')
      await app.inject({
        headers,
        method: 'PATCH',
        url: `/tenants/${tenant}/sending-config`,
        payload: { credential: 'smtp-password', webhookSecret: 'whsec_123' },
      })

      expect(app.credentialStore.get(tenant)).toEqual({ credential: 'smtp-password', webhookSecret: 'whsec_123' })
    })

    it('rejects an invalid provider enum value (400)', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/sending-config`, payload: { provider: 'carrier-pigeon' } })
      expect(response.statusCode).toBe(400)
    })

    it('rejects unknown fields at the schema level (400)', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/sending-config`, payload: { notAField: true } })
      expect(response.statusCode).toBe(400)
    })
  })

  it('rejects with 403 when no bearer token is presented (Story 006)', async () => {
    const tenant = uniqueSlug('acme')
    const response = await app.inject({ method: 'GET', url: `/tenants/${tenant}/sending-config` })
    expect(response.statusCode).toBe(403)
  })

  it('rejects with 403 when the token has an unrelated grant, not sending-config:manage', async () => {
    const tenant = uniqueSlug('acme')
    const wrongHeaders = bearer(await jwt.signToken({ permissions: ['suppressions:manage'] }))
    const response = await app.inject({ headers: wrongHeaders, method: 'GET', url: `/tenants/${tenant}/sending-config` })
    expect(response.statusCode).toBe(403)
  })

  it('rejects with 403 for a degraded token, even if permissions somehow contains the grant', async () => {
    const tenant = uniqueSlug('acme')
    const degradedHeaders = bearer(await jwt.signToken({ enrichmentStatus: 'degraded', permissions: ['sending-config:manage'] }))
    const response = await app.inject({ headers: degradedHeaders, method: 'GET', url: `/tenants/${tenant}/sending-config` })
    expect(response.statusCode).toBe(403)
  })
})
