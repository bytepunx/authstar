import { SignJWT, exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose'
import { staticKeyProvider, type JWTVerifyGetKey, type EnrichmentStatus } from '@bytepunx/authstar-fastify'

// Test-only internal-JWT signing (Story 007's permission middleware) --
// identical approach to tower's own `spec/lib/internal-jwt.ts` and
// authstar-clients' own `verify.test.ts`: mints tokens locally against a
// throwaway keypair rather than hitting a real portcullis or JWKS
// endpoint. `getKey` from `createInternalJwtFixture()` is a
// `staticKeyProvider` pinned to that keypair, passed as `authstarGetKey`
// to `buildApp()` so tests never make a real network fetch (unlike
// production's `perTenantJwksKeyProvider`).

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

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}
