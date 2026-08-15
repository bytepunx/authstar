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
import { communicationActorId } from '../../src/lib/communication-id.js'

// End-to-end tier: Story 003's "editing a template creates a new version,
// the pinned version on a `communication` stays what it was at creation
// time even if the template is edited afterward" -- exercised as a real
// sequence (create v1 -> queue a send pinned to v1 -> publish v2 -> the
// already-queued send still renders v1's content), not asserted about in
// isolation.

describe('template versioning -- edits never retroactively change a pinned send', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let adapter: FakeSendAdapter
  let jwt: InternalJwtFixture
  let manageHeaders: { authorization: string }
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])
    jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, payloadKeyring, adapterFor: () => adapter, authstarGetKey: jwt.getKey })
    manageHeaders = bearer(await jwt.signToken({ permissions: ['communication-types:manage'] }))
    readHeaders = bearer(await jwt.signToken({ permissions: ['communications:read'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  it('a communication pinned to v1 renders v1 even after v2 is published', async () => {
    const tenant = uniqueSlug('acme')
    const type = uniqueSlug('invite-sent')
    const contactId = uniqueSlug('contact')

    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })

    const v1 = await app.inject({
      headers: manageHeaders,
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/${type}/templates`,
      payload: { subjectTemplate: 'v1 subject {{name}}', bodyTemplate: 'v1 body {{name}}' },
    })
    expect(v1.json().version).toBe(1)

    const idempotencyKey = uniqueSlug('idem')
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', { name: 'Ada' })
    await consequent.handle(communicationActorId(tenant, idempotencyKey), 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type,
      title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    // Publish v2 *after* the communication was already queued against v1.
    const v2 = await app.inject({
      headers: manageHeaders,
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/${type}/templates`,
      payload: { subjectTemplate: 'v2 subject {{name}}', bodyTemplate: 'v2 body {{name}}' },
    })
    expect(v2.json().version).toBe(2)

    const outcome = await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)
    expect(outcome).toBe('sent')
    expect(adapter.sent[0].subject).toBe('v1 subject Ada')
    expect(adapter.sent[0].body).toBe('v1 body Ada')

    // A render of the historical record independently confirms the same
    // thing through the read-side route, not just the worker's own dispatch.
    const rendered = await app.inject({ headers: readHeaders, method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}/render` })
    expect(rendered.json().subject).toBe('v1 subject Ada')
  })

  it('a tenant override takes precedence over the global default at send time', async () => {
    const type = uniqueSlug('welcome')
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')

    // Seed a "global default" template the way an operator/deployment
    // process would -- directly through consequent, since creating a
    // `tenant: null` template has no tenant-scoped HTTP route by design
    // (Story 003: "never created through this tenant-scoped route").
    const globalTemplateId = uniqueSlug('template-global')
    await consequent.handle(globalTemplateId, 'template.create', {
      templateId: globalTemplateId, communicationType: type, tenant: null, version: 1,
      subjectTemplate: 'Global subject', bodyTemplate: 'Global body',
    })

    await app.inject({ headers: manageHeaders, method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type } })
    await app.inject({
      headers: manageHeaders,
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/${type}/templates`,
      payload: { subjectTemplate: 'Tenant subject', bodyTemplate: 'Tenant body' },
    })

    const idempotencyKey = uniqueSlug('idem')
    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', {})
    await consequent.handle(communicationActorId(tenant, idempotencyKey), 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type,
      title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)
    expect(adapter.sent[0].subject).toBe('Tenant subject')
  })
})
