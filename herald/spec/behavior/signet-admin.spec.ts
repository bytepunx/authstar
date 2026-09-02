import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { buildSecretArchive, syncBundleFailure } from '../../src/lib/signet-admin.js'

// ADR 0103: herald's GitOps writes now authenticate with herald's own
// workload SPIFFE identity (`dialWorkloadGitOps`, SPIFFE-mTLS) instead of
// the retired `signetAdminToken` bearer token (`gitOpsClient`). Mocking
// `@bytepunx/signet-client` here -- rather than a real/fake gRPC transport
// -- mirrors how `comms-consumer.spec.ts` is the one other spec in this
// repo that reaches for `vi.mock` instead of a hand-rolled fake, for the
// same reason: the thing being proved is "createSignetAdmin dials via
// dialWorkloadGitOps and drives the resulting client correctly", not
// anything about gRPC transport itself (buildSecretArchive/
// syncBundleFailure above already cover the wire-shape/response-parsing
// concerns in isolation, with no client involved at all).
const getSopsPublicKey = vi.fn()
const syncBundle = vi.fn()
const close = vi.fn()
const dialWorkloadGitOps = vi.fn(async () => ({
  client: { getSopsPublicKey, syncBundle } as never,
  close,
}))

vi.mock('@bytepunx/signet-client', async () => {
  const actual = await vi.importActual<typeof import('@bytepunx/signet-client')>('@bytepunx/signet-client')
  return {
    ...actual,
    dialWorkloadGitOps: (opts: unknown) => dialWorkloadGitOps(opts),
  }
})

describe('createSignetAdmin -- SPIFFE-mTLS dial, no admin token (ADR 0103)', () => {
  beforeEach(() => {
    dialWorkloadGitOps.mockClear()
    getSopsPublicKey.mockReset()
    syncBundle.mockReset()
    close.mockClear()
  })

  it('dials via dialWorkloadGitOps using address + trustDomain, with no token in SignetAdminOptions', async () => {
    const { createSignetAdmin } = await import('../../src/lib/signet-admin.js')

    // This object literal is the actual proof: `SignetAdminOptions` no
    // longer has a `token` field at all (removed, not made optional) --
    // if it did, TypeScript's excess-property check on this literal would
    // catch a stray `token` here, and the type itself would still accept
    // one. Passing only `address`/`trustDomain`/`namespace` compiling
    // clean is what "no longer requires or accepts a token" means at the
    // type level; the runtime assertions below confirm the dial itself
    // never sees one either.
    await createSignetAdmin({ address: 'signet.internal:8443', trustDomain: 'authstar.internal', namespace: 'authstar' })

    expect(dialWorkloadGitOps).toHaveBeenCalledTimes(1)
    const dialOpts = dialWorkloadGitOps.mock.calls[0][0] as Record<string, unknown>
    expect(dialOpts).toEqual({ address: 'signet.internal:8443', trustDomain: 'authstar.internal' })
    expect(dialOpts).not.toHaveProperty('token')
    expect(dialOpts).not.toHaveProperty('plaintext')
  })

  it('pushSecret fetches the SOPS public key and calls SyncBundle on the workload-mTLS client, with zero signetd errors treated as success', async () => {
    const { createSignetAdmin } = await import('../../src/lib/signet-admin.js')

    getSopsPublicKey.mockImplementation((_req: unknown, cb: (err: null, resp: { publicKey: string }) => void) =>
      cb(null, { publicKey: 'age1c6yjh0jkjz0s3ldjh96nl4f8z4pdug7yz9z2ttnafkf7zzlfl96qsadpsu' })
    )
    const writes: unknown[] = []
    syncBundle.mockImplementation((cb: (err: null, resp: { errors: string[] }) => void) => {
      const call = {
        write: (msg: unknown) => writes.push(msg),
        end: () => cb(null, { errors: [] }),
      }
      return call
    })

    const admin = await createSignetAdmin({ address: 'signet.internal:8443', trustDomain: 'authstar.internal', namespace: 'authstar' })
    await admin.pushSecret('tower', 'heraldPayloadPublicKey', '{"version":1}')

    expect(getSopsPublicKey).toHaveBeenCalledTimes(1)
    expect(syncBundle).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(2)
  })

  it('rejects when signetd reports a SyncBundle error, surfacing the target/key in the message', async () => {
    const { createSignetAdmin } = await import('../../src/lib/signet-admin.js')

    getSopsPublicKey.mockImplementation((_req: unknown, cb: (err: null, resp: { publicKey: string }) => void) =>
      cb(null, { publicKey: 'age1c6yjh0jkjz0s3ldjh96nl4f8z4pdug7yz9z2ttnafkf7zzlfl96qsadpsu' })
    )
    syncBundle.mockImplementation((cb: (err: null, resp: { errors: string[] }) => void) => ({
      write: () => {},
      end: () => cb(null, { errors: ['unrecognised path shape'] }),
    }))

    const admin = await createSignetAdmin({ address: 'signet.internal:8443', trustDomain: 'authstar.internal', namespace: 'authstar' })
    await expect(admin.pushSecret('keep', 'someKey', 'value')).rejects.toThrow(/unrecognised path shape/)
  })
})

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
