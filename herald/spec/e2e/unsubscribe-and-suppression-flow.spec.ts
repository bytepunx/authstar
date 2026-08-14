import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import { processCommunication } from '../../src/lib/send-worker.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer, type InternalJwtFixture } from '../lib/internal-jwt.js'

// End-to-end tier: a realistic sequence spanning marketing send -> click
// unsubscribe -> a later send for the same category is suppressed, and
// separately, a manual admin suppression blocking a manual retry --
// through the HTTP surface end to end (Story 002/004), not any one call's
// contract in isolation.

describe('unsubscribe and suppression, end to end', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let adapter: FakeSendAdapter
  let jwt: InternalJwtFixture
  let manageHeaders: { authorization: string }
  let readHeaders: { authorization: string }
  let optOutsHeaders: { authorization: string }
  let suppressionsHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, payloadKeyring, adapterFor: () => adapter, authstarGetKey: jwt.getKey })
    manageHeaders = bearer(await jwt.signToken({ permissions: ['communication-types:manage'] }))
    readHeaders = bearer(await jwt.signToken({ permissions: ['communications:read'] }))
    optOutsHeaders = bearer(await jwt.signToken({ permissions: ['opt-outs:manage'] }))
    suppressionsHeaders = bearer(await jwt.signToken({ permissions: ['suppressions:manage'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  async function seedMarketingCommunication(tenant: string, type: string, contactId: string, idempotencyKey: string) {
    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type, category: 'marketing' } })
    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'Sale!', bodyTemplate: 'Big sale, {{name}}' } })
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'shopper@example.com', { name: 'Sam' })
    await consequent.handle(`${tenant}:${idempotencyKey}`, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'marketing', type,
      title: 'Sale', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })
  }

  it('walks: marketing send delivers unsubscribe link -> recipient unsubscribes -> next send in that category is suppressed, all via HTTP', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('flash-sale')
    const contactId = uniqueSlug('contact')

    const firstKey = uniqueSlug('idem-1')
    await seedMarketingCommunication(tenant, type, contactId, firstKey)
    const firstOutcome = await processCommunication(app.sendWorkerDeps, tenant, firstKey)
    expect(firstOutcome).toBe('sent')

    // Extract the token from the List-Unsubscribe header the worker set on
    // the sent message -- exactly what a real mail client would surface.
    const header = adapter.sent[0].headers['List-Unsubscribe']
    const token = new URL(header.slice(1, -1)).searchParams.get('token')!

    const confirm = await app.inject({ method: 'GET', url: `/unsubscribe?token=${encodeURIComponent(token)}` })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().confirmed).toBe(false) // GET never performs the action

    const unsub = await app.inject({ method: 'POST', url: '/unsubscribe', payload: { token } })
    expect(unsub.statusCode).toBe(200)
    expect(unsub.json().confirmed).toBe(true)

    const optOuts = await app.inject({ headers: optOutsHeaders, method: 'GET', url: `/tenants/${tenant}/opt-outs/${contactId}` })
    expect(optOuts.json().optedOutCategories).toEqual([type])

    const secondKey = uniqueSlug('idem-2')
    await seedMarketingCommunication(tenant, type, contactId, secondKey)
    const secondOutcome = await processCommunication(app.sendWorkerDeps, tenant, secondKey)
    expect(secondOutcome).toBe('suppressed')
    expect(adapter.sent).toHaveLength(1) // still just the one real send from before

    const history = await app.inject({ headers: readHeaders, method: 'GET', url: `/tenants/${tenant}/communications/${secondKey}` })
    expect(history.json().status).toBe('suppressed')
  })

  it('walks: permanent failure -> failed -> admin adds a manual suppression -> manual retry still suppresses, not force-sends', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')

    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types/${type}/templates`, payload: { subjectTemplate: 'Hi', bodyTemplate: 'Body' } })
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', { name: 'X' })
    await consequent.handle(`${tenant}:${idempotencyKey}`, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type,
      title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    adapter = new FakeSendAdapter([{ success: false, error: { message: 'invalid recipient', transient: false } }])
    app.sendWorkerDeps.adapterFor = () => adapter
    expect(await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)).toBe('failed')

    const suppress = await app.inject({ headers: suppressionsHeaders, method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId, reason: 'manual' } })
    expect(suppress.statusCode).toBe(201)

    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'should-not-be-used' }])
    app.sendWorkerDeps.adapterFor = () => adapter

    const retry = await app.inject({ headers: readHeaders, method: 'PATCH', url: `/tenants/${tenant}/communications/${idempotencyKey}`, payload: { status: 'pending' } })
    expect(retry.statusCode).toBe(200)
    expect(retry.json().status).toBe('suppressed')
    expect(adapter.sent).toHaveLength(0)
  })
})
