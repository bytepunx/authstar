import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createDeterministicIds } from '../lib/fakes.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for `POST /identities/resolve` (Story 003, ADR 0027/0028).
// Response shape matches portcullis's real Rust client
// (`authstar-middleware/src/identities.rs`'s `IdentityResolution` struct):
// `{ accountId, isNewAccount }`, plus this pilot's own `redeemed` addition
// (ignored by that client, folding in Story 007 token-invite redemption).

describe('POST /identities/resolve', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent, ids: createDeterministicIds() })
  })

  afterEach(async () => {
    await app.close()
  })

  it('creates a new account and identity on first login (no candidate hash matches)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.isNewAccount).toBe(true)
    expect(body.accountId).toBeTruthy()

    const [identity] = await consequent.find('identity', [{ identityHash: 'hash-1' }] as unknown as Record<string, unknown>)
    expect(identity!.state.accountId).toBe(body.accountId)
    const account = await consequent.fetch('account', body.accountId)
    expect(account!.state.tenant).toBe('acme')
  })

  it('resolves an existing identity without creating a new account', async () => {
    await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })
    await consequent.handle('identity-1', 'identity.create', { identityHash: 'hash-1', tenant: 'acme', idp: 'dex', accountId: 'acct-1' })

    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'someone@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.isNewAccount).toBe(false)
    expect(body.accountId).toBe('acct-1')
  })

  it('aliases forward when the current-generation hash misses but an older-generation candidate matches (ADR 0028)', async () => {
    await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })
    await consequent.handle('identity-1', 'identity.create', { identityHash: 'old-hash', tenant: 'acme', idp: 'dex', accountId: 'acct-1' })

    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      // current-gen first, old-gen second -- matches on the second candidate
      payload: { tenant: 'acme', idp: 'dex', identityHashes: ['new-hash', 'old-hash'], email: 'someone@acme.test' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().accountId).toBe('acct-1')

    const [aliased] = await consequent.find('identity', [{ identityHash: 'new-hash' }] as unknown as Record<string, unknown>)
    expect(aliased!.state.accountId).toBe('acct-1')
  })

  it('redeems a pending token invite matching the resolved account\'s contact, granting its roles', async () => {
    const contact = await app.contactStore.upsert('acme', 'admin@acme.test')
    await consequent.handle('invite-token', 'invite.create', {
      tenant: 'acme',
      application: null,
      contactId: contact.id,
      roles: [{ name: 'admin', scope: 'tenant' }],
      permissions: [],
      expiresAt: null,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: {
        tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'admin@acme.test',
        redeem: { type: 'invite', token: 'invite-token' },
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.redeemed).toBe(true)

    const account = await consequent.fetch('account', body.accountId)
    expect(account!.state.grantedRoles).toEqual([{ name: 'admin', scope: 'tenant' }])
    const invite = await consequent.fetch('invite', 'invite-token')
    expect(invite!.state.status).toBe('accepted')
  })

  it('does not redeem an invite whose contact does not match the resolved account -- login still succeeds', async () => {
    const otherContact = await app.contactStore.upsert('acme', 'someone-else@acme.test')
    await consequent.handle('invite-token', 'invite.create', {
      tenant: 'acme', application: null, contactId: otherContact.id,
      roles: [{ name: 'admin', scope: 'tenant' }], permissions: [], expiresAt: null,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: {
        tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test',
        redeem: { type: 'invite', token: 'invite-token' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().redeemed).toBe(false)
  })

  it('grants an elevated-bootstrap invite\'s permissions on acceptance, not just its roles', async () => {
    const contact = await app.contactStore.upsert('acme', 'admin@acme.test')
    await consequent.handle('invite-token', 'invite.create', {
      tenant: 'acme',
      application: null,
      contactId: contact.id,
      roles: [],
      permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }],
      expiresAt: null,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: {
        tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'admin@acme.test',
        redeem: { type: 'invite', token: 'invite-token' },
      },
    })

    expect(response.json().redeemed).toBe(true)
    const account = await consequent.fetch('account', response.json().accountId)
    expect(account!.state.permissions).toEqual([{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }])
  })

  describe('inviteCode redemption', () => {
    it('grants roles permanently when trialDurationDays is unset', async () => {
      await consequent.handle('acme:LAUNCH50', 'inviteCode.create', {
        tenant: 'acme', code: 'LAUNCH50', application: '', issuedBy: 'acct-issuer',
        roles: [{ name: 'member', scope: 'tenant' }], trialDurationDays: null, maxRedemptions: null, expiresAt: null,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: {
          tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test',
          redeem: { type: 'inviteCode', code: 'LAUNCH50' },
        },
      })

      expect(response.json().redeemed).toBe(true)
      const account = await consequent.fetch('account', response.json().accountId)
      expect(account!.state.grantedRoles).toEqual([{ name: 'member', scope: 'tenant' }])
      expect(account!.state.trialRoles).toEqual([])
      const inviteCode = await consequent.fetch('inviteCode', 'acme:LAUNCH50')
      expect(inviteCode!.state.redemptionCount).toBe(1)
    })

    it('grants roles as a trial with a computed expiry when trialDurationDays is set', async () => {
      await consequent.handle('acme:TRIAL14', 'inviteCode.create', {
        tenant: 'acme', code: 'TRIAL14', application: '', issuedBy: 'acct-issuer',
        roles: [{ name: 'pro', scope: 'tenant' }], trialDurationDays: 14, maxRedemptions: null, expiresAt: null,
      })

      const before = Date.now()
      const response = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: {
          tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test',
          redeem: { type: 'inviteCode', code: 'TRIAL14' },
        },
      })

      expect(response.json().redeemed).toBe(true)
      const account = await consequent.fetch('account', response.json().accountId)
      expect(account!.state.grantedRoles).toEqual([])
      expect(account!.state.trialRoles).toEqual([{ name: 'pro', scope: 'tenant' }])
      const expiresAt = new Date(account!.state.trialExpiresAt as string).getTime()
      expect(expiresAt).toBeGreaterThan(before + 13 * 24 * 60 * 60 * 1000)
      expect(expiresAt).toBeLessThan(before + 15 * 24 * 60 * 60 * 1000)
    })

    it('increments redemptionCount across multiple redemptions, allowing up to maxRedemptions', async () => {
      await consequent.handle('acme:LAUNCH50', 'inviteCode.create', {
        tenant: 'acme', code: 'LAUNCH50', application: '', issuedBy: 'acct-issuer',
        roles: [{ name: 'member', scope: 'tenant' }], trialDurationDays: null, maxRedemptions: 2, expiresAt: null,
      })

      const first = await app.inject({
        method: 'POST', url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'one@acme.test', redeem: { type: 'inviteCode', code: 'LAUNCH50' } },
      })
      const second = await app.inject({
        method: 'POST', url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-2'], email: 'two@acme.test', redeem: { type: 'inviteCode', code: 'LAUNCH50' } },
      })
      const third = await app.inject({
        method: 'POST', url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-3'], email: 'three@acme.test', redeem: { type: 'inviteCode', code: 'LAUNCH50' } },
      })

      expect(first.json().redeemed).toBe(true)
      expect(second.json().redeemed).toBe(true)
      expect(third.json().redeemed).toBe(false) // maxRedemptions exhausted -- login still succeeds
      expect(third.statusCode).toBe(200)
    })

    it('does not redeem a revoked invite code -- login still succeeds', async () => {
      await consequent.handle('acme:LAUNCH50', 'inviteCode.create', {
        tenant: 'acme', code: 'LAUNCH50', application: '', issuedBy: 'acct-issuer',
        roles: [{ name: 'member', scope: 'tenant' }], trialDurationDays: null, maxRedemptions: null, expiresAt: null,
      })
      await consequent.handle('acme:LAUNCH50', 'inviteCode.revoke', {})

      const response = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test', redeem: { type: 'inviteCode', code: 'LAUNCH50' } },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().redeemed).toBe(false)
    })

    it('does not redeem an expired invite code -- login still succeeds', async () => {
      await consequent.handle('acme:LAUNCH50', 'inviteCode.create', {
        tenant: 'acme', code: 'LAUNCH50', application: '', issuedBy: 'acct-issuer',
        roles: [{ name: 'member', scope: 'tenant' }], trialDurationDays: null, maxRedemptions: null,
        expiresAt: '2020-01-01T00:00:00.000Z',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test', redeem: { type: 'inviteCode', code: 'LAUNCH50' } },
      })

      expect(response.json().redeemed).toBe(false)
    })

    it('does not redeem a nonexistent invite code -- login still succeeds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/identities/resolve',
        payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'new@acme.test', redeem: { type: 'inviteCode', code: 'NONEXISTENT' } },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().redeemed).toBe(false)
    })
  })
})
