// Tokens here are signed locally with jose's own SignJWT, mirroring exactly what
// authstar-middleware/src/jwt/{session,internal}.rs actually produces (claim names,
// ES256, a kid header) -- not fetched from a live portcullis, since none is available
// in CI. staticKeyProvider is the only key-resolution path exercised: it's the only
// one usable against a real cluster today (see this repo's README on the JWKS gap).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT, exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose'
import { staticKeyProvider } from './key-providers.js'
import { verifySessionJwt, verifyInternalJwt } from './verify.js'
import { AuthstarJwtError } from './errors.js'
import { extractBearerToken } from './bearer.js'

async function generateTestKey(): Promise<{ getKey: ReturnType<typeof staticKeyProvider>; kid: string; privateKey: CryptoKey }> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwk: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' }
  return { getKey: staticKeyProvider({ keys: [jwk] }), kid, privateKey }
}

test('verifySessionJwt accepts a validly-signed, matching-issuer/audience token', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    iss: 'https://acme.authstar.app',
    aud: 'acme',
  })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 604_800)
    .sign(privateKey)

  const claims = await verifySessionJwt(token, getKey, { issuer: 'https://acme.authstar.app', audience: 'acme' })
  assert.equal(claims.sub, 'admin@example.com')
  assert.equal(claims.idp, 'dex')
  assert.equal(claims.identityHash, 'abc123')
  assert.equal(claims.iss, 'https://acme.authstar.app')
  assert.equal(claims.aud, 'acme')
})

test('verifySessionJwt rejects a wrong audience', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ sub: 'a@b.com', idp: 'dex', identityHash: 'x', iss: 'https://acme.authstar.app', aud: 'other-tenant' })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  await assert.rejects(
    () => verifySessionJwt(token, getKey, { issuer: 'https://acme.authstar.app', audience: 'acme' }),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'wrong-audience',
  )
})

test('verifySessionJwt rejects an expired token', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ sub: 'a@b.com', idp: 'dex', identityHash: 'x', iss: 'https://acme.authstar.app', aud: 'acme' })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt(now - 1000)
    .setExpirationTime(now - 500)
    .sign(privateKey)

  await assert.rejects(
    () => verifySessionJwt(token, getKey, { issuer: 'https://acme.authstar.app', audience: 'acme' }),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'expired',
  )
})

test('verifySessionJwt rejects a token signed by an unknown key (unknown kid)', async () => {
  const { getKey } = await generateTestKey()
  const other = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ sub: 'a@b.com', idp: 'dex', identityHash: 'x', iss: 'https://acme.authstar.app', aud: 'acme' })
    .setProtectedHeader({ alg: 'ES256', kid: other.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(other.privateKey)

  await assert.rejects(
    () => verifySessionJwt(token, getKey, { issuer: 'https://acme.authstar.app', audience: 'acme' }),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'unknown-kid',
  )
})

test('verifyInternalJwt accepts an "ok" enrichment token and returns roles', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    accountId: 'acct-1',
    roles: ['admin'],
    permissions: ['tenant:manage'],
    isNewAccount: true,
  })
    .setProtectedHeader({ alg: 'ES256', kid, tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  const claims = await verifyInternalJwt(token, getKey)
  assert.equal(claims.enrichmentStatus, 'ok')
  assert.equal(claims.accountId, 'acct-1')
  assert.deepEqual(claims.roles, ['admin'])
  assert.deepEqual(claims.permissions, ['tenant:manage'])
  assert.equal(claims.isNewAccount, true)
  assert.equal(claims.tenant, 'acme')
  assert.deepEqual(claims.organizationMemberships, [])
})

test('verifyInternalJwt returns organizationMemberships (ADR 0100) -- an account can belong to more than one', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    accountId: 'acct-1',
    roles: [],
    permissions: [],
    organizationMemberships: [
      { organizationId: 'org-1', roles: ['member', 'manager'] },
      { organizationId: 'org-2', roles: ['member'] },
    ],
  })
    .setProtectedHeader({ alg: 'ES256', kid, tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  const claims = await verifyInternalJwt(token, getKey)
  assert.deepEqual(claims.organizationMemberships, [
    { organizationId: 'org-1', roles: ['member', 'manager'] },
    { organizationId: 'org-2', roles: ['member'] },
  ])
})

test('verifyInternalJwt drops a malformed organizationMemberships entry rather than throwing', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    accountId: 'acct-1',
    roles: [],
    permissions: [],
    organizationMemberships: [{ organizationId: 'org-1', roles: ['member'] }, { organizationId: 42, roles: 'not-an-array' }, 'not-an-object'],
  })
    .setProtectedHeader({ alg: 'ES256', kid, tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  const claims = await verifyInternalJwt(token, getKey)
  assert.deepEqual(claims.organizationMemberships, [{ organizationId: 'org-1', roles: ['member'] }])
})

test('verifyInternalJwt accepts a "degraded" token with empty roles/permissions, not as an error', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'degraded',
    roles: [],
    permissions: [],
  })
    .setProtectedHeader({ alg: 'ES256', kid, tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  const claims = await verifyInternalJwt(token, getKey)
  assert.equal(claims.enrichmentStatus, 'degraded')
  assert.equal(claims.accountId, undefined)
  assert.deepEqual(claims.roles, [])
  assert.deepEqual(claims.permissions, [])
  assert.deepEqual(claims.organizationMemberships, [])
  assert.equal(claims.tenant, 'acme')
})

test('verifyInternalJwt rejects a token whose header is missing the tenant hint', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    roles: [],
    permissions: [],
  })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)

  await assert.rejects(
    () => verifyInternalJwt(token, getKey),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'missing-claim',
  )
})

test('extractBearerToken parses a well-formed header', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi')
})

test('extractBearerToken rejects a missing or malformed header', () => {
  assert.throws(() => extractBearerToken(undefined), AuthstarJwtError)
  assert.throws(() => extractBearerToken(''), AuthstarJwtError)
  assert.throws(() => extractBearerToken('Basic abc123'), AuthstarJwtError)
})
