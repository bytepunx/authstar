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
// signetd's own path parser does would have caught it. Found live: herald's
// own POST /operator/rotate-keys reported success while tower never
// actually received the pushed key. Identical test to tower's own
// spec/behavior/signet-admin.spec.ts -- see that file for the fuller
// incident writeup.
function extractTarEntryPath(gzipped: Buffer): string {
  const tar = gunzipSync(gzipped)
  const nameBytes = tar.subarray(0, 100)
  const nulIndex = nameBytes.indexOf(0)
  return nameBytes.subarray(0, nulIndex === -1 ? 100 : nulIndex).toString('utf8')
}

describe('buildSecretArchive', () => {
  it('produces a tar entry path with exactly <namespace>/<service>/<name>.yaml after secrets/', () => {
    const archive = buildSecretArchive('authstar', 'tower', 'heraldPayloadPublicKey', Buffer.from('{"version":1}'))
    const path = extractTarEntryPath(archive)
    expect(path).toBe('secrets/authstar/tower/heraldPayloadPublicKey.yaml')

    const rel = path.replace(/^secrets\//, '')
    expect(rel.split('/')).toHaveLength(3)
  })

  // `content` is opaque bytes here -- real callers pass `encryptForSecret`'s
  // own output (real SOPS ciphertext, tested against a round-trip through
  // the real `sops` binary in signet-clients' own test suite, not
  // reproduced here). This only proves buildSecretArchive's own remaining
  // responsibility: tar+gzip framing preserves the given bytes exactly.
  it('embeds the given content bytes exactly, unmodified', () => {
    const content = Buffer.from('sops:\n  age:\n    - recipient: age1abc\nvalue: ENC[...]\n', 'utf8')
    const archive = buildSecretArchive('authstar', 'herald', 'payloadKeyGenerations', content)
    const tar = gunzipSync(archive)
    const embedded = tar.subarray(512, 512 + content.length)
    expect(embedded.equals(content)).toBe(true)
  })
})

describe('syncBundleFailure', () => {
  it('returns null when signetd reports zero errors', () => {
    expect(syncBundleFailure({ errors: [] })).toBeNull()
  })

  it('returns the join of signetd-reported errors', () => {
    const failure = syncBundleFailure({
      errors: ['skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape'],
    })
    expect(failure).toBe('skipped secrets/tower/heraldPayloadPublicKey.yaml: unrecognised path shape')
  })

  it('does NOT flag a real idempotent re-push (zero errors) as a failure', () => {
    // Found live, the hard way -- see this function's own comment: an
    // earlier version also checked `secretsAdded + secretsUpdated === 0`
    // and misreported a genuine idempotent re-push as a failure even
    // though signetd reported zero errors.
    expect(syncBundleFailure({ errors: [] })).toBeNull()
  })
})
