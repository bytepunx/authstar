import { SignJWT, exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose'
import { staticKeyProvider, type JWTVerifyGetKey, type EnrichmentStatus } from '@bytepunx/authstar-fastify'

// Test-only internal-JWT signing, the same approach as herald's, tower's,
// and keep's `spec/lib/internal-jwt.ts`: tokens are minted locally as
// portcullis mints them (ES256, header `{alg, kid, tenant}`) against a
// throwaway keypair. `getKey` is a `staticKeyProvider` pinned to that
// keypair, passed as `authstarGetKey` to `buildApp()`, so chronicle's real
// verification path runs and no test fetches JWKS.

export interface InternalTokenOverrides {
  sub?: string
  idp?: string
  identityHash?: string
  tenant?: string
  enrichmentStatus?: EnrichmentStatus
  accountId?: string
  roles?: string[]
  permissions?: string[]
}

export interface InternalJwtFixture {
  getKey: JWTVerifyGetKey
  signToken(overrides?: InternalTokenOverrides): Promise<string>
}

export async function createInternalJwtFixture(): Promise<InternalJwtFixture> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwk: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' }
  const getKey = staticKeyProvider({ keys: [jwk] })

  return {
    getKey,
    async signToken(overrides = {}) {
      const now = Math.floor(Date.now() / 1000)
      const tenant = overrides.tenant ?? 'acme'
      return new SignJWT({
        sub: overrides.sub ?? 'admin@example.com',
        idp: overrides.idp ?? 'dex',
        identityHash: overrides.identityHash ?? 'abc123',
        enrichmentStatus: overrides.enrichmentStatus ?? 'ok',
        accountId: overrides.accountId,
        roles: overrides.roles ?? [],
        permissions: overrides.permissions ?? [],
      })
        .setProtectedHeader({ alg: 'ES256', kid, tenant })
        .setIssuedAt(now)
        .setExpirationTime(now + 60)
        .sign(privateKey)
    },
  }
}

// The fixture every spec shares: pass `testJwt.getKey` as `authstarGetKey`.
export const testJwt = await createInternalJwtFixture()

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

// A bearer header for tenant `acme` carrying `permissions`, signed by `testJwt`.
export async function bearerHeader(
  permissions: string[] = ['analytics:read'],
  overrides: InternalTokenOverrides = {},
): Promise<{ authorization: string }> {
  return bearer(await testJwt.signToken({ permissions, ...overrides }))
}

// Tokens chronicle must refuse with 401, for the per-route auth cases.
export async function unknownKeyBearerHeader(): Promise<{ authorization: string }> {
  const other = await createInternalJwtFixture()
  return bearer(await other.signToken({ permissions: ['analytics:read'] }))
}

export async function hs256BearerHeader(): Promise<{ authorization: string }> {
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ enrichmentStatus: 'ok', roles: [], permissions: ['analytics:read'] })
    .setProtectedHeader({ alg: 'HS256', tenant: 'acme' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode('a-shared-secret-chronicle-no-longer-accepts'))
  return bearer(token)
}

// The cases every `analytics:read` route is held to, as `it.each` rows:
// [what the request carries, its headers, the status chronicle answers].
// 401 means no token verified; 403 means it verified but may not read.
export const analyticsReadAuthCases: Array<[string, () => Promise<Record<string, string>>, number]> = [
  ['an ES256 token for the tenant carrying analytics:read gets 200', () => bearerHeader(), 200],
  ['no token gets 401', async () => ({}), 401],
  ['a token signed by an unknown key gets 401', unknownKeyBearerHeader, 401],
  ['an HS256 token gets 401', hs256BearerHeader, 401],
  ['a valid token without analytics:read gets 403', () => bearerHeader(['some-other:permission']), 403],
  ['a valid token whose tenant header names another tenant gets 403', () => bearerHeader(['analytics:read'], { tenant: 'globex' }), 403],
  ['a degraded token gets 403', () => bearerHeader(['analytics:read'], { enrichmentStatus: 'degraded' }), 403],
]
