import { describe, it, expect } from 'vitest'
import { requireBundleSecret } from '../../src/lib/bundle-secrets.js'

// ADR 0102's fail-loud-on-missing rule for `src/server.ts` -- proves the
// shared helper `signetAdminToken`/`operatorToken` both now route through
// (Story 007) actually throws, naming the missing field, instead of
// silently falling back the way this repo used to (`secrets.signetAdminToken
// ?? requireEnv('SIGNET_ADMIN_TOKEN')`, `secrets.operatorToken ?? ''`).
// `server.ts` itself dials real signet at import time and is out of scope
// for unit coverage (see its own header comment / TESTING.md), so this
// exercises the extracted decision in isolation, same posture as
// `signet-admin.spec.ts` for `buildSecretArchive`/`syncBundleFailure`.
describe('requireBundleSecret', () => {
  it('returns the value when the field is present in the bundle secrets', () => {
    const secrets = { signetAdminToken: 'a-real-token' }
    expect(requireBundleSecret(secrets, 'signetAdminToken')).toBe('a-real-token')
  })

  it('throws naming the field when signetAdminToken is missing from the bundle', () => {
    const secrets: Record<string, string> = {}
    expect(() => requireBundleSecret(secrets, 'signetAdminToken')).toThrow(/signetAdminToken/)
  })

  it('throws naming the field when operatorToken is missing from the bundle', () => {
    const secrets: Record<string, string> = {}
    expect(() => requireBundleSecret(secrets, 'operatorToken')).toThrow(/operatorToken/)
  })

  it('throws (not returns a falsy value) when the field is present but empty', () => {
    // A bundle field explicitly present as '' is exactly the "silently
    // treated as valid" failure mode ADR 0102 closes for `operatorToken`
    // -- an empty string must fail loud, not be accepted as "no operator
    // auth required".
    const secrets = { operatorToken: '' }
    expect(() => requireBundleSecret(secrets, 'operatorToken')).toThrow(/operatorToken/)
  })
})
