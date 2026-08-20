import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPrivateKey, constants, generateKeyPairSync, privateDecrypt, createDecipheriv } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher, createSpySignetAdmin } from '../lib/fakes.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'
import type { TenantState } from '../../src/actors/tenant_actor.js'
import type { EncryptedEnvelope } from '../../src/lib/herald-payload-crypto.js'

// Decrypts exactly the way herald's own `payload-crypto.ts#decryptPayload`
// does (RSA-OAEP-SHA256-wrapped AES-256-GCM) -- same standalone-reimplementation
// convention `herald-payload-crypto.spec.ts` uses to prove the wire format is
// genuinely decryptable, not just structurally present.
function decryptLikeHerald(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], envelope: EncryptedEnvelope): unknown {
  const aesKey = privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(envelope.wrappedKey, 'base64'),
  )
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

// Behavior tier for Story 012 / ADR 0067's `POST /tenants` provisioning
// flow. `signetAdmin`/`publisher` are spy fakes (see spec/lib/fakes.ts) --
// no real signet/RabbitMQ, but real assertions on exactly what would have
// been pushed/published.

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: false,
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
  // A real keypair, private half retained here (never by `app` itself
  // beyond signing) -- `createEphemeralHeraldKey`'s own default discards
  // the private key immediately, which would make the invite-sent
  // envelope this test needs to decrypt permanently unreadable.
  const { publicKey, privateKey: heraldPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const app = await buildApp({
    consequent, signetAdmin, publisher, provisioningConfig: config,
    heraldPayloadKey: { version: 1, publicKey },
  })
  return { app, consequent, signetAdmin, publisher, heraldPrivateKey }
}

describe('POST /tenants -- provisioning', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>
  let publisher: ReturnType<typeof createSpyPublisher>
  let heraldPrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey']

  beforeEach(async () => {
    ;({ app, consequent, signetAdmin, publisher, heraldPrivateKey } = await buildProvisioningApp())
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects without an operator token when self-service is disabled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects the old x-operator-token header -- steward never sends it, only Authorization: Bearer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { 'x-operator-token': 'op-secret' },
      payload: { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a malformed slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'Not_Valid!', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects "authstar" as a reserved slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'authstar', name: 'Nope', domain: 'nope.io', adminEmail: 'admin@nope.test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a malformed domain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'acme', name: 'Acme', domain: 'not a domain', adminEmail: 'admin@acme.test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a domain already registered to a different tenant', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'other', name: 'Other', domain: 'acme.io', adminEmail: 'admin@other.test' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('runs the full provisioning sequence for an operator-authenticated request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.slug).toBe('acme')
    expect(body.domain).toBe('acme.io')
    expect(body.adminHost).toBe('authstar.acme.io')

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
    expect((adminApp!.state as { hosts: string[] }).hosts).toEqual(['authstar.acme.io'])

    // ADR 0091: the tenant's full config (cookie/jwt/providers/
    // identityHashKeyGenerations/applications) registered with portcullis
    // in one atomic patch -- previously nothing ever did this at all.
    expect(signetAdmin.patchCalls).toHaveLength(1)
    const [patchCall] = signetAdmin.patchCalls
    expect(patchCall.targetService).toBe('portcullis')
    expect(patchCall.operations).toHaveLength(1)
    const [op] = patchCall.operations as Array<{ op: string, path: string, value: Record<string, unknown> }>
    expect(op.op).toBe('add')
    expect(op.path).toBe('/tenants/acme')
    expect(op.value.cookie).toMatchObject({ domain: 'acme.io', httpOnly: true, secure: true })
    expect(op.value.jwt).toMatchObject({ issuer: 'https://acme.io', audience: 'acme' })
    expect(op.value.applications).toMatchObject({
      _admin: { hosts: ['authstar.acme.io'], upstream: { base: expect.any(String) } },
    })

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
    // The template data itself (adminHost/token/tenant name, folded into
    // the encrypted envelope) never appears in plaintext anywhere else in
    // the published message -- the whole point of the envelope. (The
    // invite token legitimately does appear elsewhere, in
    // `idempotencyKey` -- that's intentional message-routing metadata,
    // not a leak of the encrypted payload.)
    const { encryptedPayload, ...restOfMessage } = payload
    expect(JSON.stringify(restOfMessage)).not.toContain('authstar.acme.io')
    const envelope = JSON.parse(encryptedPayload) as EncryptedEnvelope
    expect(Object.keys(envelope).sort()).toEqual(['authTag', 'ciphertext', 'iv', 'keyVersion', 'wrappedKey'])

    // Genuinely decryptable, and in the exact shape herald's real
    // send-worker.ts actually reads (`decrypted.to`/`decrypted.templateData`)
    // -- not the flat `{ tenantName, token, adminHost }` shape this route
    // used to send, which send-worker could never have rendered from.
    const decrypted = decryptLikeHerald(heraldPrivateKey, envelope) as { to: string, templateData: Record<string, unknown> }
    expect(decrypted.to).toBe('admin@acme.test')
    expect(decrypted.templateData).toEqual({
      tenant: { name: 'Acme' },
      token: expect.any(String),
      adminHost: 'authstar.acme.io',
    })
  })

  it('retrying the same request is idempotent -- no duplicate secret pushes, patches, or actor re-creation', async () => {
    const payload = { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' }
    const first = await app.inject({ method: 'POST', url: '/tenants', headers: { authorization: 'Bearer op-secret' }, payload })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({ method: 'POST', url: '/tenants', headers: { authorization: 'Bearer op-secret' }, payload })
    expect(second.statusCode).toBe(201)
    expect(second.json()).toEqual(first.json())

    // Still exactly 5 secret pushes and 1 config patch -- the retry skipped every already-done step.
    expect(signetAdmin.calls).toHaveLength(5)
    expect(signetAdmin.patchCalls).toHaveLength(1)
  })

  it('allows unauthenticated requests when self-service is enabled', async () => {
    const selfService = { ...provisioningConfig, selfServiceEnabled: true }
    const { app: selfServiceApp } = await buildProvisioningApp(selfService)

    const response = await selfServiceApp.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'selfserve', name: 'Self Serve Co', domain: 'selfserve.io', adminEmail: 'admin@selfserve.test' },
    })

    expect(response.statusCode).toBe(201)
    await selfServiceApp.close()
  })
})

// ADR 0093: domain-pending tenants -- created without a domain, completed
// later via PATCH /tenants/:tenantSlug/domain.
describe('domain-pending provisioning (ADR 0093)', () => {
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

  it('creates a tenant with no domain, deferring everything hostname-dependent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'pending-co', name: 'Pending Co', adminEmail: 'admin@pending.test' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.domain).toBeNull()
    expect(body.adminHost).toBeNull()

    const tenant = (await consequent.fetch('tenant', 'pending-co'))!.state as unknown as TenantState
    expect(tenant.domain).toBeNull()
    expect(tenant.secretsProvisioned).toBe(true) // not domain-dependent -- still runs
    expect(tenant.portcullisRegistered).toBe(false) // domain-dependent -- deferred

    const adminApp = await consequent.fetch('application', 'pending-co:_admin')
    expect((adminApp?.state as { createdAt?: string } | undefined)?.createdAt).toBeFalsy()
    expect(signetAdmin.patchCalls).toHaveLength(0)
    expect(publisher.calls).toHaveLength(0)
  })

  it('completes provisioning once a domain is set via PATCH', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'pending-co', name: 'Pending Co', adminEmail: 'admin@pending.test' },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/pending-co/domain',
      headers: { authorization: 'Bearer op-secret' },
      payload: { domain: 'pending-co.io' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.domain).toBe('pending-co.io')
    expect(body.adminHost).toBe('authstar.pending-co.io')

    const tenant = (await consequent.fetch('tenant', 'pending-co'))!.state as unknown as TenantState
    expect(tenant.domain).toBe('pending-co.io')
    expect(tenant.portcullisRegistered).toBe(true)

    const adminApp = await consequent.fetch('application', 'pending-co:_admin')
    expect((adminApp!.state as { hosts: string[] }).hosts).toEqual(['authstar.pending-co.io'])
    expect(signetAdmin.patchCalls).toHaveLength(1)
    expect(publisher.calls).toHaveLength(1)
    expect(publisher.calls[0].routingKey).toBe('comms.transactional.invite-sent')
  })

  it('rejects setting a domain on a tenant that never existed', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/nonexistent/domain',
      headers: { authorization: 'Bearer op-secret' },
      payload: { domain: 'nonexistent.io' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('rejects setting a domain already claimed by another tenant', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'taken', name: 'Taken', domain: 'shared.io', adminEmail: 'admin@taken.test' },
    })
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'pending-co', name: 'Pending Co', adminEmail: 'admin@pending.test' },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/pending-co/domain',
      headers: { authorization: 'Bearer op-secret' },
      payload: { domain: 'shared.io' },
    })
    expect(response.statusCode).toBe(409)
  })

  it('rejects re-setting a domain once one is already set', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'acme', name: 'Acme', domain: 'acme.io', adminEmail: 'admin@acme.test' },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme/domain',
      headers: { authorization: 'Bearer op-secret' },
      payload: { domain: 'different.io' },
    })
    expect(response.statusCode).toBe(409)
  })

  it('retrying the same PATCH is idempotent', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: 'Bearer op-secret' },
      payload: { slug: 'pending-co', name: 'Pending Co', adminEmail: 'admin@pending.test' },
    })

    const payload = { domain: 'pending-co.io' }
    const first = await app.inject({ method: 'PATCH', url: '/tenants/pending-co/domain', headers: { authorization: 'Bearer op-secret' }, payload })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'PATCH', url: '/tenants/pending-co/domain', headers: { authorization: 'Bearer op-secret' }, payload })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())

    expect(signetAdmin.patchCalls).toHaveLength(1)
    expect(publisher.calls).toHaveLength(1)
  })
})
