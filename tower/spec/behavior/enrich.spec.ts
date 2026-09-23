import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Behavior tier for `POST /enrich` (Story 002, ADR 0001/0003). Response
// shape is pinned to match portcullis's real Rust client
// (`authstar-middleware/src/enricher.rs`'s `AllowOutcome` struct) --
// camelCase `accountId`/`grantedRoles`/`trialRoles`/`trialExpiresAt`/`usage`,
// Deny signaled purely via HTTP status (403), never a body field.

describe('POST /enrich', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent })
  })

  afterEach(async () => {
    await app.close()
  })

  async function seedAccount(accountId: string, overrides: Record<string, unknown> = {}) {
    await consequent.handle(accountId, 'account.create', { accountId, tenant: 'acme', contactId: 'contact-1' })
    if (overrides.grantedRoles) {
      for (const role of overrides.grantedRoles as Array<{ name: string, scope: unknown }>) {
        await consequent.handle(accountId, 'account.grant-role', { role })
      }
    }
    if (overrides.suspend) {
      await consequent.handle(accountId, 'account.suspend', {})
    }
    if (overrides.permissions) {
      for (const permission of overrides.permissions as Array<{ grant: string, scope: string, maxOutstanding: null }>) {
        await consequent.handle(accountId, 'account.grant-permission', { permission })
      }
    }
  }

  async function seedIdentity(hash: string, accountId: string) {
    await consequent.handle(`identity-${hash}`, 'identity.create', { identityHash: hash, tenant: 'acme', idp: 'dex', accountId })
  }

  it('denies when the identity hash has no matching identity', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'unknown-hash', email: '', application: 'app1' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'Forbidden' })
  })

  it('denies when the resolved account is suspended', async () => {
    await seedAccount('acct-1', { suspend: true })
    await seedIdentity('hash-1', 'acct-1')

    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'hash-1', email: '', application: 'app1' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('allows and returns filtered roles/usage for an active account', async () => {
    await seedAccount('acct-1', {
      grantedRoles: [
        { name: 'member', scope: 'tenant' },
        { name: 'editor', scope: { application: 'app1' } },
        { name: 'other-app-role', scope: { application: 'app2' } },
      ],
    })
    await seedIdentity('hash-1', 'acct-1')

    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'hash-1', email: '', application: 'app1' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.outcome).toBe('allow')
    expect(body.accountId).toBe('acct-1')
    expect(body.grantedRoles.sort()).toEqual(['editor', 'member'])
    expect(body.trialRoles).toEqual([])
    expect(body.trialExpiresAt).toBeNull()
  })

  it('returns permissions as a flat array of grant strings, not PermissionGrant objects', async () => {
    // Regression test: portcullis's `AllowOutcome.permissions` (enricher.rs)
    // is `Vec<String>` -- sending the account's raw `PermissionGrant` objects
    // fails serde deserialization on portcullis's side, which silently
    // fail-opens to a degraded token with empty permissions/roles.
    await seedAccount('acct-1', {
      permissions: [
        { grant: 'billing:manage', scope: 'tenant', maxOutstanding: null },
        { grant: 'billing:read', scope: 'tenant', maxOutstanding: null },
      ],
    })
    await seedIdentity('hash-1', 'acct-1')

    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'hash-1', email: '', application: 'app1' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.permissions.sort()).toEqual(['billing:manage', 'billing:read'])
  })

  it('rejects a request missing required fields at the schema level', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme' },
    })
    expect(response.statusCode).toBe(400)
  })
})
