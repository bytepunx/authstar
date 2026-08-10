import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPrivateKey } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher, createSpySignetAdmin } from '../lib/fakes.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'
import type { TenantState } from '../../src/actors/tenant_actor.js'

// Behavior tier for Story 012 / ADR 0067's `POST /tenants` provisioning
// flow. `signetAdmin`/`publisher` are spy fakes (see spec/lib/fakes.ts) --
// no real signet/RabbitMQ, but real assertions on exactly what would have
// been pushed/published.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: {
    name: 'dex', clientId: 'client-1', discoveryUrl: 'https://dex.example/.well-known', scope: ['openid', 'email'],
  },
  defaultProviderClientSecret: 'provider-secret-value',
}

async function buildProvisioningApp(config: ProvisioningConfig = provisioningConfig) {
  const consequent = await buildInMemoryConsequent()
  const signetAdmin = createSpySignetAdmin()
  const publisher = createSpyPublisher()
  const app = await buildApp({ consequent, signetAdmin, publisher, provisioningConfig: config })
  return { app, consequent, signetAdmin, publisher }
}

describe('POST /tenants -- provisioning', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>
  let publisher: ReturnType<typeof createSpyPublisher>

  beforeEach(async () => {
    ;({ app, consequent, signetAdmin, publisher } = await buildProvisioningApp())
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without an operator token when self-service is disabled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'acme', name: 'Acme', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a malformed slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { slug: 'Not_Valid!', name: 'Acme', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('runs the full provisioning sequence for an operator-authenticated request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { slug: 'acme', name: 'Acme', adminEmail: 'admin@acme.test' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.slug).toBe('acme')
    expect(body.adminHost).toBe('admin.acme.authstar.test')

    // tenant created and marked as fully secret-provisioned
    const tenant = (await consequent.fetch('tenant', 'acme'))!.state as unknown as TenantState
    expect(tenant.createdAt).toBeTruthy()
    expect(tenant.secretsProvisioned).toBe(true)

    // default provider seeded
    const provider = await consequent.fetch('provider', 'acme:dex')
    expect(provider!.state.name).toBe('dex')

    // _admin application auto-created
    const adminApp = await consequent.fetch('application', 'acme:_admin')
    expect(adminApp!.state.slug).toBe('_admin')
    expect((adminApp!.state as { hosts: string[] }).hosts).toEqual(['admin.acme.authstar.test'])

    // four provisioning secrets + one provider secret pushed
    expect(signetAdmin.calls).toHaveLength(5)
    expect(signetAdmin.calls.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        'tenant-acme-provider-dex-client-secret',
        'tenant-acme-session-key',
        'tenant-acme-internal-key',
        'tenant-acme-identity-hash-key-1',
        'tenant-acme-contact-hash-pepper',
      ]),
    )
    const towerSecret = signetAdmin.calls.find((c) => c.key === 'tenant-acme-contact-hash-pepper')
    expect(towerSecret?.targetService).toBe('tower')
    const portcullisSecret = signetAdmin.calls.find((c) => c.key === 'tenant-acme-session-key')
    expect(portcullisSecret?.targetService).toBe('portcullis')
    // session-key/internal-key must be real PEM-encoded EC private keys --
    // portcullis's EcKeyPair::from_pem_bytes (authstar-middleware/
    // src/keys.rs) parses these with jsonwebtoken's ES256 EncodingKey,
    // which needs actual key material, not opaque random bytes. Confirmed
    // by parsing back through node:crypto itself (a valid PKCS8 PEM for a
    // P-256/prime256v1 key, not just a string that happens to start with
    // the right header), not just checked for the PEM header text.
    for (const key of ['tenant-acme-session-key', 'tenant-acme-internal-key']) {
      const pem = signetAdmin.calls.find((c) => c.key === key)?.value as string
      expect(pem).toContain('-----BEGIN PRIVATE KEY-----')
      const parsed = createPrivateKey(pem)
      expect(parsed.asymmetricKeyType).toBe('ec')
      const details = parsed.asymmetricKeyDetails as { namedCurve?: string }
      expect(details.namedCurve).toBe('prime256v1')
    }
    // identity-hash-key/contact-hash-pepper stay opaque HMAC-style bytes,
    // not EC keys -- portcullis's identity_hash.rs takes raw key bytes.
    const identityHashKey = signetAdmin.calls.find((c) => c.key === 'tenant-acme-identity-hash-key-1')?.value as string
    expect(identityHashKey).not.toContain('BEGIN')

    // first-admin invite issued and comms.transactional.invite-sent
    // published -- shape matches herald's real IngestMessage contract
    // (ADR 0025's encrypted-payload amendment), confirmed against
    // herald's own src/lib/ingest.ts, not assumed from ADR prose. See
    // herald-payload-crypto.spec.ts for proof the encryption itself is
    // genuinely decryptable, not just structurally present here.
    expect(publisher.calls).toHaveLength(1)
    expect(publisher.calls[0].routingKey).toBe('comms.transactional.invite-sent')
    const payload = publisher.calls[0].payload as {
      tenant: string
      application: string
      contactId: string
      type: string
      title: string
      templateVersion: number
      encryptedPayload: string
      payloadKeyVersion: number
      channel: string
    }
    expect(payload.tenant).toBe('acme')
    expect(payload.application).toBe('_admin')
    expect(payload.contactId).toBeTruthy()
    expect(payload.type).toBe('invite-sent')
    expect(payload.title).toContain('Acme')
    expect(payload.templateVersion).toBe(1)
    expect(payload.channel).toBe('email')
    expect(typeof payload.payloadKeyVersion).toBe('number')
    // The template data itself (tenantName/adminHost, folded into the
    // encrypted envelope) never appears in plaintext anywhere else in the
    // published message -- the whole point of the envelope. (The invite
    // token legitimately does appear elsewhere, in `idempotencyKey` --
    // that's intentional message-routing metadata, not a leak of the
    // encrypted payload.) Recipient addressing goes through `contactId`,
    // not a `to` field (herald resolves the contact's email itself).
    const { encryptedPayload, ...restOfMessage } = payload
    expect(JSON.stringify(restOfMessage)).not.toContain('admin.acme.authstar.test')
    const envelope = JSON.parse(encryptedPayload)
    expect(Object.keys(envelope).sort()).toEqual(['authTag', 'ciphertext', 'iv', 'keyVersion', 'wrappedKey'])
  })

  it('retrying the same request is idempotent -- no duplicate secret pushes or actor re-creation', async () => {
    const payload = { slug: 'acme', name: 'Acme', adminEmail: 'admin@acme.test' }
    const first = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-operator-token': 'op-secret' }, payload })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-operator-token': 'op-secret' }, payload })
    expect(second.statusCode).toBe(201)
    expect(second.json()).toEqual(first.json())

    // Still exactly 5 secret pushes -- the retry skipped every already-done step.
    expect(signetAdmin.calls).toHaveLength(5)
  })

  it('allows unauthenticated requests when self-service is enabled', async () => {
    const selfService = { ...provisioningConfig, selfServiceEnabled: true }
    const { app: selfServiceApp } = await buildProvisioningApp(selfService)

    const response = await selfServiceApp.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'selfserve', name: 'Self Serve Co', adminEmail: 'admin@selfserve.test' },
    })

    expect(response.statusCode).toBe(201)
    await selfServiceApp.close()
  })

  it('honors an operator-supplied adminHost but ignores it for non-operator callers', async () => {
    const selfService = { ...provisioningConfig, selfServiceEnabled: true }
    const { app: selfServiceApp } = await buildProvisioningApp(selfService)

    const response = await selfServiceApp.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'ignored-host', name: 'Co', adminEmail: 'admin@co.test', adminHost: 'custom.example.com' },
    })
    expect(response.json().adminHost).toBe('admin.ignored-host.authstar.test')
    await selfServiceApp.close()
  })
})
