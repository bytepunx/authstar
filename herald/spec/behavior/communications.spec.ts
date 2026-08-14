import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// Behavior tier: design/stories/herald/004-communication-history-opt-outs-and-suppressions.md's
// communication history routes, plus the manual-retry route from Story 002.
// Communications have no HTTP creation route (Story 002: ingestion is via
// RabbitMQ) -- setup goes through `consequent.handle` directly, same
// convention tower's pilot used for tenant creation.

describe('communication history -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let adapter: FakeSendAdapter
  let jwt: InternalJwtFixture
  let headers: { authorization: string }
  let setupHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    adapter = new FakeSendAdapter()
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, payloadKeyring, adapterFor: () => adapter, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['communications:read'] }))
    setupHeaders = bearer(await jwt.signToken({ permissions: ['communication-types:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function seedCommunication(overrides: Partial<{ tenant: string, idempotencyKey: string, contactId: string, category: 'transactional' | 'marketing', type: string, title: string, templateVersion: number }> = {}) {
    const tenant = overrides.tenant ?? uniqueSlug('acme')
    const idempotencyKey = overrides.idempotencyKey ?? uniqueSlug('idem')
    const contactId = overrides.contactId ?? uniqueSlug('contact')
    const type = overrides.type ?? uniqueSlug('invite-sent')
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'recipient@example.com', { name: 'Ada' })

    await app.inject({ headers: setupHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    await app.inject({
      headers: setupHeaders,
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/${type}/templates`,
      payload: { subjectTemplate: 'Hi {{name}}', bodyTemplate: 'Welcome, {{name}}!' },
    })

    await consequent.handle(`${tenant}:${idempotencyKey}`, 'communication.create', {
      idempotencyKey,
      tenant,
      application: 'app1',
      contactId,
      category: overrides.category ?? 'transactional',
      type,
      title: overrides.title ?? 'Invite sent',
      templateVersion: overrides.templateVersion ?? 1,
      encryptedPayload,
      payloadKeyVersion,
      channel: 'email',
    })

    return { tenant, idempotencyKey, contactId, type }
  }

  describe('GET /tenants/:tenantSlug/communications', () => {
    it('lists communications for the tenant, excluding encryptedPayload/payloadKeyVersion', async () => {
      const { tenant } = await seedCommunication()
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].encryptedPayload).toBeUndefined()
      expect(body.items[0].payloadKeyVersion).toBeUndefined()
      expect(body.items[0].status).toBe('pending')
    })

    it('filters by status', async () => {
      const tenant = uniqueSlug('acme')
      await seedCommunication({ tenant })
      await seedCommunication({ tenant })

      const pendingResponse = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications?status=pending` })
      expect(pendingResponse.json().items).toHaveLength(2)

      const sentResponse = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications?status=sent` })
      expect(sentResponse.json().items).toHaveLength(0)
    })

    it('filters by contactId', async () => {
      const tenant = uniqueSlug('acme')
      const { contactId } = await seedCommunication({ tenant })
      await seedCommunication({ tenant })

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications?contactId=${contactId}` })
      expect(response.json().items).toHaveLength(1)
    })

    it('cursor-paginates -- a page has a nextCursor when more rows exist, and following it yields the remainder with no overlap', async () => {
      const tenant = uniqueSlug('acme')
      const seeded = [await seedCommunication({ tenant }), await seedCommunication({ tenant }), await seedCommunication({ tenant })]

      const firstPage = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications?limit=2` })
      const firstBody = firstPage.json()
      expect(firstBody.items).toHaveLength(2)
      expect(firstBody.nextCursor).not.toBeNull()

      const secondPage = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications?limit=2&cursor=${firstBody.nextCursor}` })
      const secondBody = secondPage.json()
      expect(secondBody.items).toHaveLength(1)
      expect(secondBody.nextCursor).toBeNull()

      const allKeys = [...firstBody.items, ...secondBody.items].map((i: { idempotencyKey: string }) => i.idempotencyKey).sort()
      expect(allKeys).toEqual(seeded.map((s) => s.idempotencyKey).sort())
    })
  })

  describe('GET /tenants/:tenantSlug/communications/:id', () => {
    it('returns 404 for an id that was never created', async () => {
      const tenant = uniqueSlug('acme')
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications/nonexistent` })
      expect(response.statusCode).toBe(404)
    })

    it('returns the minimal audit fields for a real record', async () => {
      const { tenant, idempotencyKey, title } = await seedCommunication({ title: 'Invite sent' })
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.title).toBe('Invite sent')
      expect(body.encryptedPayload).toBeUndefined()
    })
  })

  describe('GET /tenants/:tenantSlug/communications/:id/render', () => {
    it('decrypts and renders using the pinned template', async () => {
      const { tenant, idempotencyKey } = await seedCommunication()
      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}/render` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.payloadAvailable).toBe(true)
      expect(body.to).toBe('recipient@example.com')
      expect(body.subject).toBe('Hi Ada')
      expect(body.body).toBe('Welcome, Ada!')
    })

    it('indicates purged payload without erroring', async () => {
      const { tenant, idempotencyKey } = await seedCommunication()
      // Simulate the (not-yet-built, see TESTING.md) retention sweep having
      // purged the payload -- drives the actor's own `purgePayload` command
      // directly, the same way tower's pilot drove setup steps with no
      // route of their own.
      const key = `${tenant}:${idempotencyKey}`
      await consequent.handle(key, 'communication.purgePayload', {})

      const response = await app.inject({ headers, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}/render` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.payloadAvailable).toBe(false)
      expect(body.reason).toContain('purged')
    })
  })

  describe('PATCH /tenants/:tenantSlug/communications/:id -- manual retry', () => {
    it('resets a failed communication back to pending and re-attempts the send', async () => {
      const { tenant, idempotencyKey } = await seedCommunication()
      const key = `${tenant}:${idempotencyKey}`
      // Drive straight to `failed` via a permanent-failure adapter result,
      // then flip the adapter to succeed before retrying -- exercises the
      // real command guard (`resetForRetry` only reachable from `failed`)
      // plus a real re-dispatch, not just the state transition in isolation.
      adapter = new FakeSendAdapter([{ success: false, error: { message: 'invalid recipient', transient: false } }])
      app.sendWorkerDeps.adapterFor = () => adapter
      const { processCommunication } = await import('../../src/lib/send-worker.js')
      await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)
      const failedState = await consequent.fetch('communication', key)
      expect((failedState!.state as { status: string }).status).toBe('failed')

      adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])
      app.sendWorkerDeps.adapterFor = () => adapter

      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/communications/${idempotencyKey}`, payload: { status: 'pending' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('sent')
    })

    it('rejects retrying a communication that is not failed (409)', async () => {
      const { tenant, idempotencyKey } = await seedCommunication()
      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/communications/${idempotencyKey}`, payload: { status: 'pending' } })
      expect(response.statusCode).toBe(409)
    })

    it('rejects any status other than "pending" at the schema level (400)', async () => {
      const { tenant, idempotencyKey } = await seedCommunication()
      const response = await app.inject({ headers, method: 'PATCH', url: `/tenants/${tenant}/communications/${idempotencyKey}`, payload: { status: 'sent' } })
      expect(response.statusCode).toBe(400)
    })
  })
})
