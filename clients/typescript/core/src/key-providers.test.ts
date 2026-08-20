// perTenantJwksKeyProvider is the one key provider that makes its own network fetch based on
// data read from the token itself (ADR 0089's tenant header hint) -- these tests stub
// globalThis.fetch rather than hitting a real portcullis, and specifically cover the SSRF
// guard (TENANT_SLUG_PATTERN in key-providers.ts) since that's the part a wire-format-only
// review of the ADR wouldn't catch.
import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { SignJWT, exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose'
import { perTenantJwksKeyProvider } from './key-providers.js'
import { verifyInternalJwt } from './verify.js'
import { AuthstarJwtError } from './errors.js'

async function signInternalToken(tenant: string | undefined, kid: string, privateKey: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    roles: [],
    permissions: [],
  })
    .setProtectedHeader(tenant === undefined ? { alg: 'ES256', kid } : { alg: 'ES256', kid, tenant })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)
}

test("perTenantJwksKeyProvider resolves the tenant's domain, fetches its JWKS URL, and verifies against it", async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwk: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' }

  const fetchMock = mock.fn(async (input: string | URL) => {
    assert.equal(String(input), 'https://authstar.acme.io/.well-known/jwks.json')
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchMock as unknown as typeof fetch
  const resolveDomain = mock.fn(async (tenant: string) => (tenant === 'acme' ? 'acme.io' : undefined))
  try {
    const token = await signInternalToken('acme', kid, privateKey)
    const getKey = perTenantJwksKeyProvider(resolveDomain)
    const claims = await verifyInternalJwt(token, getKey)
    assert.equal(claims.tenant, 'acme')
    assert.equal(fetchMock.mock.callCount(), 1)
    assert.equal(resolveDomain.mock.callCount(), 1)

    // A second token for the same tenant reuses the cached createRemoteJWKSet -- no refetch,
    // and no second domain lookup either (a network-backed resolver isn't a per-request cost).
    const secondToken = await signInternalToken('acme', kid, privateKey)
    await verifyInternalJwt(secondToken, getKey)
    assert.equal(fetchMock.mock.callCount(), 1)
    assert.equal(resolveDomain.mock.callCount(), 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('perTenantJwksKeyProvider rejects a token whose header has no tenant hint', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)

  const token = await signInternalToken(undefined, kid, privateKey)
  const getKey = perTenantJwksKeyProvider(() => 'acme.io')

  await assert.rejects(
    () => verifyInternalJwt(token, getKey),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'missing-claim',
  )
})

test('perTenantJwksKeyProvider rejects a tenant hint that is not a single valid DNS label (SSRF guard)', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)

  const fetchMock = mock.fn(async () => {
    throw new Error('fetch should never be called for a rejected tenant hint')
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchMock as unknown as typeof fetch
  const resolveDomain = mock.fn(async () => {
    throw new Error('resolveDomain should never be called for a rejected tenant hint')
  })
  try {
    const getKey = perTenantJwksKeyProvider(resolveDomain)
    for (const malicious of ['acme.evil.com', 'acme/../../evil.com', 'evil.com/x', '']) {
      const token = await signInternalToken(malicious, kid, privateKey)
      await assert.rejects(
        () => verifyInternalJwt(token, getKey),
        (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'missing-claim',
      )
    }
    assert.equal(fetchMock.mock.callCount(), 0)
    assert.equal(resolveDomain.mock.callCount(), 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('perTenantJwksKeyProvider surfaces an unresolvable tenant domain as key-resolution-failed', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)

  const token = await signInternalToken('ghost-tenant', kid, privateKey)
  const getKey = perTenantJwksKeyProvider(() => undefined)

  await assert.rejects(
    () => verifyInternalJwt(token, getKey),
    (err: unknown) => err instanceof AuthstarJwtError && err.reason === 'key-resolution-failed',
  )
})
