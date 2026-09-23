import assert from 'node:assert/strict'
import { test } from 'node:test'
import Fastify from 'fastify'
import { SignJWT, exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose'
import { staticKeyProvider } from '@bytepunx/authstar-core'
import authstarFastifyPlugin from './plugin.js'

async function generateTestKey() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwk: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' }
  return { getKey: staticKeyProvider({ keys: [jwk] }), kid, privateKey }
}

async function signInternalToken(
  privateKey: CryptoKey,
  kid: string,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    roles: ['admin'],
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid, tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey)
}

test('rejects a request with no Authorization header (required by default)', async () => {
  const { getKey } = await generateTestKey()
  const app = Fastify()
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => getKey })
  app.get('/', async (request) => ({ authstar: request.authstar }))

  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.statusCode, 401)
  assert.equal(JSON.parse(res.body).reason, 'malformed')
})

test('accepts a validly-signed token and decorates request.authstar', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const app = Fastify()
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => getKey })
  app.get('/', async (request) => ({ authstar: request.authstar }))

  const token = await signInternalToken(privateKey, kid)
  const res = await app.inject({ method: 'GET', url: '/', headers: { authorization: `Bearer ${token}` } })
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body) as { authstar: { sub: string; roles: string[] } }
  assert.equal(body.authstar.sub, 'admin@example.com')
  assert.deepEqual(body.authstar.roles, ['admin'])
})

test('accepts a degraded token and forwards empty roles rather than rejecting', async () => {
  const { getKey, kid, privateKey } = await generateTestKey()
  const app = Fastify()
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => getKey })
  app.get('/', async (request) => ({ authstar: request.authstar }))

  const token = await signInternalToken(privateKey, kid, { enrichmentStatus: 'degraded', roles: [], accountId: undefined })
  const res = await app.inject({ method: 'GET', url: '/', headers: { authorization: `Bearer ${token}` } })
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body) as { authstar: { enrichmentStatus: string; roles: string[] } }
  assert.equal(body.authstar.enrichmentStatus, 'degraded')
  assert.deepEqual(body.authstar.roles, [])
})

test('rejects a token from an unknown key with 401', async () => {
  const { getKey } = await generateTestKey()
  const other = await generateTestKey()
  const app = Fastify()
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => getKey })
  app.get('/', async (request) => ({ authstar: request.authstar }))

  const token = await signInternalToken(other.privateKey, other.kid)
  const res = await app.inject({ method: 'GET', url: '/', headers: { authorization: `Bearer ${token}` } })
  assert.equal(res.statusCode, 401)
  assert.equal(JSON.parse(res.body).reason, 'unknown-kid')
})

test('required: false lets an unauthenticated request through with authstar left undefined', async () => {
  const { getKey } = await generateTestKey()
  const app = Fastify()
  await app.register(authstarFastifyPlugin, { getKeyForRequest: () => getKey, required: false })
  app.get('/', async (request) => ({ hasAuthstar: request.authstar !== undefined }))

  const res = await app.inject({ method: 'GET', url: '/' })
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).hasAuthstar, false)
})
