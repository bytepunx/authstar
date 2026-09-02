import { describe, expect, it } from 'vitest'
import { requireBundleSecret } from '../../src/lib/bundle-secrets.js'

// Behavior tier for `requireBundleSecret` (ADR 0102 / Story 008): the
// fail-loud helper `src/server.ts` uses for `credentialSalt` (previously not
// signet-sourced at all). Kept in its own side-effect-free module, separate
// from `server.ts`/`sync-pricing.ts` themselves, so it can be unit-tested
// without importing either entrypoint's own module-level `main().catch(...)`
// (which would try to dial signet immediately on import).
//
// `signetAdminToken` is used below purely as an example field name to
// exercise this helper's generic precedence/fail-loud behavior -- it is no
// longer an actual call site as of ADR 0103/Story 009, which retired
// `signetAdminToken` entirely (keep authenticates its signet GitOps writes
// with its own workload SPIFFE identity now, not a bundle-delivered admin
// token) without replacing its one `requireBundleSecret` call with anything.

describe('requireBundleSecret', () => {
  it('returns the value when present as a decoded secret', () => {
    const bundle = {}
    const secrets = { signetAdminToken: 'admin-token-value' }
    expect(requireBundleSecret(bundle, secrets, 'signetAdminToken')).toBe('admin-token-value')
  })

  it('prefers a plain bundle field over the same-named decoded secret, same precedence as dbConnectionString/rabbitmqUrl', () => {
    const bundle = { credentialSalt: 'from-bundle' }
    const secrets = { credentialSalt: 'from-secrets' }
    expect(requireBundleSecret(bundle, secrets, 'credentialSalt')).toBe('from-bundle')
  })

  it('falls back to the decoded secret when the bundle field is absent', () => {
    const bundle = {}
    const secrets = { credentialSalt: 'from-secrets' }
    expect(requireBundleSecret(bundle, secrets, 'credentialSalt')).toBe('from-secrets')
  })

  it('throws a startup error naming the missing field when both are absent -- no env fallback, no default', () => {
    const bundle = {}
    const secrets: Record<string, string> = {}
    expect(() => requireBundleSecret(bundle, secrets, 'signetAdminToken')).toThrow(
      "signet bundle is missing required secret 'signetAdminToken' -- provision it in signet for this service",
    )
  })

  it('throws for credentialSalt the same way', () => {
    const bundle = {}
    const secrets: Record<string, string> = {}
    expect(() => requireBundleSecret(bundle, secrets, 'credentialSalt')).toThrow(
      "signet bundle is missing required secret 'credentialSalt' -- provision it in signet for this service",
    )
  })

  it('treats an empty-string value the same as absent', () => {
    const bundle = {}
    const secrets = { signetAdminToken: '' }
    expect(() => requireBundleSecret(bundle, secrets, 'signetAdminToken')).toThrow(/missing required secret/)
  })
})
