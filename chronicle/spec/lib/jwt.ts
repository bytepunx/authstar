import { SignJWT } from 'jose'

// Test-only helper for minting a portcullis-shaped internal JWT, signed
// with the same HS256 secret the test `ChronicleConfig` uses -- exercises
// chronicle's *real* independent-verification path (Story 002 / ADR 0034's
// auth model), not a bypassed/mocked one.
export const TEST_JWT_SECRET = 'test-only-secret-do-not-use-in-production'

export async function signInternalJwt(claims: { permissions?: string[]; [key: string]: unknown } = {}): Promise<string> {
  const key = new TextEncoder().encode(TEST_JWT_SECRET)
  return new SignJWT({ permissions: [], ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

export async function bearerHeader(permissions: string[] = ['analytics:read']): Promise<{ authorization: string }> {
  const token = await signInternalJwt({ permissions })
  return { authorization: `Bearer ${token}` }
}
