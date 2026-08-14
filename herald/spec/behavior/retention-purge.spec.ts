import { describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { purgeExpiredPayloads } from '../../src/lib/retention-purge.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for the retention purge scheduled sweep (ADR 0029). Tests
// the run-once core directly (`purgeExpiredPayloads`) -- the standalone
// CronJob entrypoint that calls this against real signet/Postgres has no
// test coverage of its own, consistent with how every other authstar
// service's own entrypoint is scoped (see TESTING.md).

async function createCommunicationType(consequent: ConsequentApi, tenant: string, type: string, retentionDays: number) {
  await consequent.handle(`${tenant}:${type}`, 'communicationType.create', {
    type, tenant, category: 'transactional', retentionDays,
  })
}

// `communication`'s real business key is `${tenant}:${idempotencyKey}`,
// computed independently by both the caller (see `ingest.ts`'s own
// `ingestCommunication`) and the `created` event handler itself -- callers
// must pass this same composite string as the id to `consequent.handle`,
// not a bare idempotencyKey, or the actor ends up stored under one id
// while its own `state.key` field reports a different one (found the hard
// way debugging this spec: a purge issued against `state.key` read back
// from a `find()` result silently created and "purged" an unrelated,
// orphaned actor instance instead of the real one, since it had never
// been used as an id before).
function communicationKey(tenant: string, idempotencyKey: string): string {
  return `${tenant}:${idempotencyKey}`
}

async function createCommunication(consequent: ConsequentApi, idempotencyKey: string, overrides: { tenant: string, type: string }) {
  const key = communicationKey(overrides.tenant, idempotencyKey)
  await consequent.handle(key, 'communication.create', {
    idempotencyKey,
    tenant: overrides.tenant,
    application: 'demo-app',
    contactId: 'contact-1',
    category: 'transactional',
    type: overrides.type,
    title: 'Test',
    templateVersion: 1,
    encryptedPayload: 'ciphertext',
    payloadKeyVersion: 1,
    channel: 'email',
  })
  return key
}

describe('retention purge scheduled sweep (ADR 0029)', () => {
  it('purges a communication past its type\'s retention window', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 30)
    const key = await createCommunication(consequent, 'comm-1', { tenant: 'acme', type: 'invite-sent' })

    const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
    const result = await purgeExpiredPayloads(consequent, () => {}, farFuture)

    expect(result).toEqual({ typesChecked: 1, checked: 1, purged: 1, errors: [] })
    const communication = await consequent.fetch('communication', key)
    expect(communication!.state.encryptedPayload).toBe('')
    expect(communication!.state.payloadPurgedAt).toBeTruthy()
  })

  it('leaves a communication within its retention window untouched', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 30)
    const key = await createCommunication(consequent, 'comm-1', { tenant: 'acme', type: 'invite-sent' })

    const result = await purgeExpiredPayloads(consequent, () => {}, new Date())

    expect(result).toEqual({ typesChecked: 1, checked: 1, purged: 0, errors: [] })
    const communication = await consequent.fetch('communication', key)
    expect(communication!.state.encryptedPayload).toBe('ciphertext')
  })

  it('skips a communication whose payload was already purged (e.g. by the erasure path)', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 30)
    const key = await createCommunication(consequent, 'comm-1', { tenant: 'acme', type: 'invite-sent' })
    await consequent.handle(key, 'communication.purgePayload', {})

    const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
    const result = await purgeExpiredPayloads(consequent, () => {}, farFuture)

    expect(result).toEqual({ typesChecked: 1, checked: 1, purged: 0, errors: [] })
  })

  it('respects each communicationType\'s own retentionDays independently', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 7)
    await createCommunicationType(consequent, 'acme', 'legal-notice', 365)
    const inviteKey = await createCommunication(consequent, 'comm-invite', { tenant: 'acme', type: 'invite-sent' })
    const legalKey = await createCommunication(consequent, 'comm-legal', { tenant: 'acme', type: 'legal-notice' })

    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const result = await purgeExpiredPayloads(consequent, () => {}, in30Days)

    expect(result.purged).toBe(1)
    const invite = await consequent.fetch('communication', inviteKey)
    const legal = await consequent.fetch('communication', legalKey)
    expect(invite!.state.encryptedPayload).toBe('')
    expect(legal!.state.encryptedPayload).toBe('ciphertext')
  })

  it('never touches a deprecated communicationType\'s records', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 1)
    await consequent.handle('acme:invite-sent', 'communicationType.deprecate', {})
    await createCommunication(consequent, 'comm-1', { tenant: 'acme', type: 'invite-sent' })

    const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
    const result = await purgeExpiredPayloads(consequent, () => {}, farFuture)

    expect(result).toEqual({ typesChecked: 0, checked: 0, purged: 0, errors: [] })
  })

  it('sweeps across multiple tenants independently for the same type name', async () => {
    const consequent = await buildInMemoryConsequent()
    await createCommunicationType(consequent, 'acme', 'invite-sent', 7)
    await createCommunicationType(consequent, 'globex', 'invite-sent', 7)
    await createCommunication(consequent, 'comm-acme', { tenant: 'acme', type: 'invite-sent' })
    await createCommunication(consequent, 'comm-globex', { tenant: 'globex', type: 'invite-sent' })

    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const result = await purgeExpiredPayloads(consequent, () => {}, in30Days)

    expect(result).toEqual({ typesChecked: 2, checked: 2, purged: 2, errors: [] })
  })

  it('is a no-op against an installation with no communication types', async () => {
    const consequent = await buildInMemoryConsequent()
    const result = await purgeExpiredPayloads(consequent)
    expect(result).toEqual({ typesChecked: 0, checked: 0, purged: 0, errors: [] })
  })
})
