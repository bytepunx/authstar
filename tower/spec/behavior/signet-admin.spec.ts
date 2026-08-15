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
    expect(syncBundleFailure({ errors: [], secretsAdded: 1, secretsUpdated: 0 })).toBeNull()
  })

  it('returns null when signetd reports secrets updated (idempotent re-push)', () => {
    expect(syncBundleFailure({ errors: [], secretsAdded: 0, secretsUpdated: 1 })).toBeNull()
  })

  it('returns the join of signetd-reported errors, even with zero counts', () => {
    const failure = syncBundleFailure({
      errors: ['skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape'],
      secretsAdded: 0,
      secretsUpdated: 0,
    })
    expect(failure).toBe('skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape')
  })

  it('flags a silent no-op even when signetd reports no explicit errors', () => {
    // The exact shape that let the real bug hide: a successful RPC,
    // zero errors, and zero secrets actually persisted.
    const failure = syncBundleFailure({ errors: [], secretsAdded: 0, secretsUpdated: 0 })
    expect(failure).toBe('no secret was added or updated')
  })
})
