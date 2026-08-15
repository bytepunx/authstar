import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { buildSecretArchive, syncBundleFailure } from '../../src/lib/signet-admin.js'

// Proves buildSecretArchive's tar entry path genuinely matches signetd's
// own contract (internal/gitops/path.go's ParseSecretPath: exactly
// `<namespace>/<service>/<name>.yaml`, 3 components after the `secrets/`
// root), not just "looks plausible" -- this exact gap (a 2-component path,
// missing the namespace segment) shipped silently for as long as
// pushSecret went unexercised against a real signetd: the RPC still
// resolves successfully even when signetd skips every file in the
// archive, so nothing short of parsing the real archive bytes the way
// signetd's own path parser does would have caught it. See
// signet-admin.ts's own header comment for the full incident writeup.
function extractTarEntryPath(gzipped: Buffer): string {
  const tar = gunzipSync(gzipped)
  const nameBytes = tar.subarray(0, 100)
  const nulIndex = nameBytes.indexOf(0)
  return nameBytes.subarray(0, nulIndex === -1 ? 100 : nulIndex).toString('utf8')
}

describe('buildSecretArchive', () => {
  it('produces a tar entry path with exactly <namespace>/<service>/<name>.yaml after secrets/', () => {
    const archive = buildSecretArchive('authstar', 'portcullis', 'tenant-acme-session-key', 'pem-value')
    const path = extractTarEntryPath(archive)
    expect(path).toBe('secrets/authstar/portcullis/tenant-acme-session-key.yaml')

    // Mirrors signetd's own path.go ParseSecretPath check directly --
    // exactly 3 components after stripping the secrets/ root -- rather
    // than only asserting the one string this test happens to expect.
    const rel = path.replace(/^secrets\//, '')
    expect(rel.split('/')).toHaveLength(3)
  })

  it('embeds the given value as parseable YAML content', () => {
    const archive = buildSecretArchive('authstar', 'tower', 'contactHashPepper', 'some-secret-value')
    const tar = gunzipSync(archive)
    const content = tar.subarray(512, 512 + 'value: "some-secret-value"\n'.length).toString('utf8')
    expect(content).toBe('value: "some-secret-value"\n')
  })
})

describe('syncBundleFailure', () => {
  it('returns null when signetd reports secrets actually added', () => {
    expect(syncBundleFailure({ errors: [] })).toBeNull()
  })

  it('returns the join of signetd-reported errors', () => {
    const failure = syncBundleFailure({
      errors: ['skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape'],
    })
    expect(failure).toBe('skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape')
  })

  it('joins multiple signetd-reported errors', () => {
    const failure = syncBundleFailure({ errors: ['first problem', 'second problem'] })
    expect(failure).toBe('first problem; second problem')
  })

  it('does NOT flag a real idempotent no-op (zero errors) as a failure', () => {
    // Found live, the hard way: an earlier version of this function also
    // checked `secretsAdded + secretsUpdated === 0` and misreported a
    // genuine idempotent re-push (this exact value already stored from a
    // prior sync -- e.g. tower's own provisioning route pushes the same
    // defaultProviderClientSecret on every POST /tenants call, not just
    // the first) as a failure, even though signetd reported zero errors.
    // signetd always surfaces a genuinely-skipped file via `errors` (see
    // this function's own comment) -- zero errors is unambiguously
    // success, regardless of the add/update counts.
    expect(syncBundleFailure({ errors: [] })).toBeNull()
  })
})
