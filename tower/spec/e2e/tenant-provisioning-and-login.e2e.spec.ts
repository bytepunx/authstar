import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher, createSpySignetAdmin, createDeterministicIds } from '../lib/fakes.js'
import { startEntitlementConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/entitlement-consumer.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// End-to-end tier: the full journey this project set out to make real --
// tenant provisioning (ADR 0067) -> the first admin's login/enrollment via
// identity resolution + invite redemption (ADR 0027/0028, Story 007) ->
// claims enrichment reflecting the granted role (ADR 0001/0003) -> a
// keep-originated entitlement event granting a further role, reflected on
// the very next enrichment call (ADR 0038). All through the HTTP surface
// (except the entitlement publish, simulated via a fake RabbitMQ channel
// exactly like the behavior-tier consumer test), no external dependencies.

function fakeChannel() {
  let onMessage: ((msg: ConsumedMessage | null) => void) | undefined
  const channel: ChannelLike = {
    async consume(_queue, cb) { onMessage = cb; return {} },
    ack() {},
    nack() {},
  }
  function deliver(routingKey: string, payload: unknown) {
    onMessage!({ content: Buffer.from(JSON.stringify(payload), 'utf8'), fields: { routingKey } })
  }
  return { channel, deliver }
}
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'dex', clientId: 'c1', discoveryUrl: 'https://dex/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'secret',
}

describe('tenant provisioning -> first-admin login -> enrichment -> entitlement update, end to end', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({
      consequent,
      signetAdmin: createSpySignetAdmin(),
      publisher: createSpyPublisher(),
      ids: createDeterministicIds(),
      provisioningConfig,
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('walks the whole journey', async () => {
    // 1. Provision the tenant -- creates tenant/provider/_admin application,
    // pushes secrets, issues the first-admin invite.
    const create = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'acme', name: 'Acme', adminEmail: 'admin@acme.test' },
    })
    expect(create.statusCode).toBe(201)

    // The invite token is deterministic (tenant+adminEmail) per
    // `provisioning.ts` -- recompute it the same way to redeem it, exactly
    // as the real invite-sent email's link would encode it.
    const { createHash } = await import('node:crypto')
    const token = createHash('sha256').update('acme:admin@acme.test:admin-invite').digest('hex').slice(0, 40)

    // 2. First admin logs in via portcullis's OIDC flow -> identity
    // resolution, redeeming the invite in the same call.
    const resolve = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: {
        tenant: 'acme', idp: 'dex', identityHashes: ['admin-identity-hash'], email: 'admin@acme.test',
        redeem: { type: 'invite', token },
      },
    })
    expect(resolve.statusCode).toBe(200)
    const { accountId, isNewAccount, redeemed } = resolve.json()
    expect(isNewAccount).toBe(true)
    expect(redeemed).toBe(true)

    // 3. portcullis calls /enrich on every subsequent proxied request --
    // the admin's full tenant permission set landed as grantedRoles is
    // empty here (Story 012's invite grants *permissions*, not *roles*,
    // for the elevated bootstrap case) but the account itself is allowed.
    const enrich1 = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'admin-identity-hash', email: '', application: '_admin' },
    })
    expect(enrich1.statusCode).toBe(200)
    expect(enrich1.json().outcome).toBe('allow')
    expect(enrich1.json().accountId).toBe(accountId)

    // 4. keep grants a paid-tier role via its entitlement.* publish --
    // tower's consumer translates it into a real grant on the account.
    const { channel, deliver } = fakeChannel()
    await startEntitlementConsumer(channel, 'q', { consequent })
    deliver('entitlement.role-granted', {
      tenant: 'acme', scope: { account: accountId }, sequence: 1,
      role: { name: 'pro', scope: 'tenant' },
    })
    await flush()

    // 5. The very next enrichment call reflects the new role -- no portcullis
    // token refresh/relogin needed for tower's own view to be current.
    const enrich2 = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'admin-identity-hash', email: '', application: '_admin' },
    })
    expect(enrich2.json().grantedRoles).toEqual(['pro'])
  })
})
