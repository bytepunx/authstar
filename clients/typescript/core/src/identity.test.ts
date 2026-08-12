import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getEmail } from './identity.js'
import type { InternalClaims, SessionClaims } from './types.js'

test('getEmail reads sub off a SessionClaims', () => {
  const claims: SessionClaims = {
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    iss: 'https://acme.authstar.app',
    aud: 'acme',
    iat: 0,
    exp: 0,
  }
  assert.equal(getEmail(claims), 'admin@example.com')
})

test('getEmail reads sub off an InternalClaims', () => {
  const claims: InternalClaims = {
    sub: 'admin@example.com',
    idp: 'dex',
    identityHash: 'abc123',
    enrichmentStatus: 'ok',
    roles: [],
    iat: 0,
    exp: 0,
  }
  assert.equal(getEmail(claims), 'admin@example.com')
})
