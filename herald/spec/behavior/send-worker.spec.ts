import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { uniqueSlug } from '../lib/unique.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import { UnsubscribeKeyring } from '../../src/lib/unsubscribe-token.js'
import { processCommunication, runRetrySweep, type SendWorkerDeps } from '../../src/lib/send-worker.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { communicationActorId } from '../../src/lib/communication-id.js'

// Behavior tier: design/stories/herald/002-send-worker-and-retry.md's core
// logic, tested directly against the worker module rather than through
// fastify -- there's no HTTP route for the ingestion/dispatch path itself
// (Story 002: it's RabbitMQ-driven), so this is the worker's real
// "contract." No real broker or SMTP/SES adapter needed -- suppression/
// opt-out checks, rendering, and retry classification all run against
// real `consequent` (in-memory) plus a scriptable `FakeSendAdapter`.

describe('send worker -- core logic', () => {
  let consequent: ConsequentApi
  let payloadKeyring: PayloadKeyring
  let unsubscribeKeyring: UnsubscribeKeyring

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    payloadKeyring = new PayloadKeyring()
    unsubscribeKeyring = new UnsubscribeKeyring()
  })

  afterEach(() => {})

  async function seed(overrides: Partial<{ category: 'transactional' | 'marketing', tenant: string, type: string, contactId: string }> = {}) {
    const tenant = overrides.tenant ?? uniqueSlug('acme')
    const type = overrides.type ?? uniqueSlug('invite-sent')
    const contactId = overrides.contactId ?? uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')
    const category = overrides.category ?? 'transactional'

    await consequent.handle(`${tenant}:${type}`, 'communicationType.create', { type, tenant, category })
    const templateId = uniqueSlug('template')
    await consequent.handle(templateId, 'template.create', {
      templateId, communicationType: type, tenant, version: 1,
      subjectTemplate: 'Hi {{name}}', bodyTemplate: 'Welcome {{name}}!',
    })

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'to@example.com', { name: 'Ada' })
    await consequent.handle(communicationActorId(tenant, idempotencyKey), 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category, type,
      title: 'Test', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    return { tenant, type, contactId, idempotencyKey }
  }

  function deps(adapter: FakeSendAdapter, overrides: Partial<SendWorkerDeps> = {}): SendWorkerDeps {
    return {
      consequent,
      payloadKeyring,
      unsubscribeKeyring,
      adapterFor: () => adapter,
      ...overrides,
    }
  }

  it('renders the pinned template and dispatches on success', async () => {
    const { tenant, idempotencyKey } = await seed()
    const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(outcome).toBe('sent')
    expect(adapter.sent).toHaveLength(1)
    expect(adapter.sent[0].to).toBe('to@example.com')
    expect(adapter.sent[0].subject).toBe('Hi Ada')
    expect(adapter.sent[0].body).toBe('Welcome Ada!')

    const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
    expect((state!.state as { status: string }).status).toBe('sent')
    expect((state!.state as { providerMessageId: string }).providerMessageId).toBe('msg-1')
  })

  it('appends the CAN-SPAM footer and List-Unsubscribe headers for marketing, never for transactional', async () => {
    const { tenant, idempotencyKey } = await seed({ category: 'marketing' })
    await consequent.handle(tenant, 'sendingConfig.update', { tenant, physicalAddress: '123 Main St' })
    const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])

    await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(adapter.sent[0].body).toContain('123 Main St')
    expect(adapter.sent[0].body).toContain('Unsubscribe')
    expect(adapter.sent[0].headers['List-Unsubscribe']).toMatch(/^<.*>$/)
    expect(adapter.sent[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('never appends the footer/headers for transactional', async () => {
    const { tenant, idempotencyKey } = await seed({ category: 'transactional' })
    const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])

    await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(adapter.sent[0].body).not.toContain('Unsubscribe')
    expect(adapter.sent[0].headers['List-Unsubscribe']).toBeUndefined()
  })

  it('suppresses instead of sending when a blanket suppression exists -- no adapter call made', async () => {
    const { tenant, contactId, idempotencyKey } = await seed()
    await consequent.handle(contactId, 'suppression.create', { tenant, contactId, reason: 'hard-bounce' })
    const adapter = new FakeSendAdapter()

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(outcome).toBe('suppressed')
    expect(adapter.sent).toHaveLength(0)
    const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
    expect((state!.state as { status: string }).status).toBe('suppressed')
  })

  it('suppresses a marketing send when the contact opted out of that type -- but never a transactional one', async () => {
    const { tenant, contactId, type, idempotencyKey } = await seed({ category: 'marketing' })
    await consequent.handle(contactId, 'optOut.addCategory', { tenant, contactId, category: type })
    const adapter = new FakeSendAdapter()

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(outcome).toBe('suppressed')
    expect(adapter.sent).toHaveLength(0)
  })

  it('an opt-out for a different type never blocks this send', async () => {
    const { tenant, contactId, idempotencyKey } = await seed({ category: 'marketing' })
    await consequent.handle(contactId, 'optOut.addCategory', { tenant, contactId, category: 'some-other-type' })
    const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(outcome).toBe('sent')
  })

  it('a suppression added between attempts blocks a later retry -- checked fresh every time', async () => {
    const { tenant, contactId, idempotencyKey } = await seed()
    const adapter = new FakeSendAdapter([{ success: false, error: { message: 'timeout', transient: true } }])

    const first = await processCommunication(deps(adapter), tenant, idempotencyKey)
    expect(first).toBe('retry-scheduled')

    await consequent.handle(contactId, 'suppression.create', { tenant, contactId, reason: 'manual' })

    const second = await processCommunication(deps(adapter), tenant, idempotencyKey)
    expect(second).toBe('suppressed')
    expect(adapter.sent).toHaveLength(1) // only the first attempt actually called the adapter
  })

  it('transient failure schedules a retry with retryCount/nextRetryAt/lastError, stays pending', async () => {
    const { tenant, idempotencyKey } = await seed()
    const adapter = new FakeSendAdapter([{ success: false, error: { message: 'rate limited', transient: true } }])
    const now = new Date('2026-01-01T00:00:00.000Z')

    const outcome = await processCommunication(deps(adapter, { now: () => now }), tenant, idempotencyKey)

    expect(outcome).toBe('retry-scheduled')
    const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
    const s = state!.state as { status: string, retryCount: number, nextRetryAt: string, lastError: string }
    expect(s.status).toBe('pending')
    expect(s.retryCount).toBe(1)
    expect(s.lastError).toBe('rate limited')
    expect(new Date(s.nextRetryAt).getTime()).toBeGreaterThan(now.getTime())
  })

  it('permanent failure goes straight to failed, no retry scheduled', async () => {
    const { tenant, idempotencyKey } = await seed()
    const adapter = new FakeSendAdapter([{ success: false, error: { message: 'invalid recipient', transient: false } }])

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)

    expect(outcome).toBe('failed')
    const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
    const s = state!.state as { status: string, nextRetryAt: string | null, error: string | null }
    expect(s.status).toBe('failed')
    expect(s.nextRetryAt).toBeNull()
    expect(s.error).toBe('invalid recipient')
  })

  it('exhausted retries land in failed -- same terminal value as an immediate permanent failure', async () => {
    const { tenant, idempotencyKey } = await seed()
    const alwaysTransient = { success: false, error: { message: 'timeout', transient: true } }
    const adapter = new FakeSendAdapter([alwaysTransient])
    const wDeps = deps(adapter, { maxRetries: 2, retryBackoffMs: () => 0 })

    expect(await processCommunication(wDeps, tenant, idempotencyKey)).toBe('retry-scheduled')
    expect(await processCommunication(wDeps, tenant, idempotencyKey)).toBe('retry-scheduled')
    // Third attempt: retryCount(2) is no longer < maxRetries(2) -- exhausted.
    expect(await processCommunication(wDeps, tenant, idempotencyKey)).toBe('failed')

    const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
    expect((state!.state as { status: string }).status).toBe('failed')
  })

  it('is a no-op for a communication that does not exist', async () => {
    const adapter = new FakeSendAdapter()
    const outcome = await processCommunication(deps(adapter), uniqueSlug('nope'), uniqueSlug('nope'))
    expect(outcome).toBe('skipped')
    expect(adapter.sent).toHaveLength(0)
  })

  it('is a no-op for a communication already in a terminal state (idempotent re-processing)', async () => {
    const { tenant, idempotencyKey } = await seed()
    const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-1' }])
    await processCommunication(deps(adapter), tenant, idempotencyKey)

    const outcome = await processCommunication(deps(adapter), tenant, idempotencyKey)
    expect(outcome).toBe('skipped')
    expect(adapter.sent).toHaveLength(1) // not re-sent
  })

  describe('runRetrySweep', () => {
    it('picks up pending communications whose nextRetryAt has arrived', async () => {
      const { tenant, idempotencyKey } = await seed()
      const failThenSucceed = new FakeSendAdapter([
        { success: false, error: { message: 'timeout', transient: true } },
      ])
      const past = new Date(Date.now() - 60_000)
      await processCommunication(deps(failThenSucceed, { now: () => past, retryBackoffMs: () => 0 }), tenant, idempotencyKey)

      const adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-2' }])
      const outcomes = await runRetrySweep(deps(adapter))

      expect(outcomes).toContain('sent')
      const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
      expect((state!.state as { status: string }).status).toBe('sent')
    })

    it('does not pick up a communication whose nextRetryAt is still in the future', async () => {
      const { tenant, idempotencyKey } = await seed()
      const adapter = new FakeSendAdapter([{ success: false, error: { message: 'timeout', transient: true } }])
      await processCommunication(deps(adapter, { retryBackoffMs: () => 60 * 60_000 }), tenant, idempotencyKey)

      const sweepAdapter = new FakeSendAdapter([{ success: true, providerMessageId: 'msg-2' }])
      await runRetrySweep(deps(sweepAdapter))

      expect(sweepAdapter.sent).toHaveLength(0)
      const state = await consequent.fetch('communication', communicationActorId(tenant, idempotencyKey))
      expect((state!.state as { status: string }).status).toBe('pending')
    })
  })
})
