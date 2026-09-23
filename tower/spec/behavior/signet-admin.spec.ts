import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { buildSecretArchive, syncBundleFailure, createSignetAdmin, type SignetAdminOptions } from '../../src/lib/signet-admin.js'
import { dialWorkloadGitOps, encryptForSecret } from '@bytepunx/signet-client'

// ADR 0103 / Story 017: createSignetAdmin no longer dials via gitOpsClient's
// admin-bearer-token path (`token`, `plaintext: true`) -- it dials via
// dialWorkloadGitOps, the same workload-mTLS credential-building step
// dialWorkload already uses for tower's ordinary bundle fetch. Mocked here
// (rather than exercised against a real signetd) for the same reason the
// rest of this file's tests stay in-process -- see this file's own header
// comment on why `SignetAdmin` exists as a narrow, fakeable interface.
vi.mock('@bytepunx/signet-client', () => ({
  dialWorkloadGitOps: vi.fn(),
  encryptForSecret: vi.fn(),
}))

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
    const archive = buildSecretArchive('authstar', 'portcullis', 'tenant-acme-session-key', Buffer.from('pem-value'))
    const path = extractTarEntryPath(archive)
    expect(path).toBe('secrets/authstar/portcullis/tenant-acme-session-key.yaml')

    // Mirrors signetd's own path.go ParseSecretPath check directly --
    // exactly 3 components after stripping the secrets/ root -- rather
    // than only asserting the one string this test happens to expect.
    const rel = path.replace(/^secrets\//, '')
    expect(rel.split('/')).toHaveLength(3)
  })

  // `content` is opaque bytes here -- real callers pass `encryptForSecret`'s
  // own output (real SOPS ciphertext, tested against a round-trip through
  // the real `sops` binary in signet-clients' own test suite, not
  // reproduced here). This only proves buildSecretArchive's own remaining
  // responsibility: tar+gzip framing preserves the given bytes exactly,
  // regardless of what produced them.
  it('embeds the given content bytes exactly, unmodified', () => {
    const content = Buffer.from('sops:\n  age:\n    - recipient: age1abc\nvalue: ENC[...]\n', 'utf8')
    const archive = buildSecretArchive('authstar', 'tower', 'contactHashPepper', content)
    const tar = gunzipSync(archive)
    const embedded = tar.subarray(512, 512 + content.length)
    expect(embedded.equals(content)).toBe(true)
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

// ADR 0103 / Story 017: createSignetAdmin now dials via dialWorkloadGitOps
// (workload SPIFFE-mTLS) instead of gitOpsClient (admin bearer token +
// `plaintext: true`). These tests replace what would previously have been
// coverage of the token-dial path -- there was none in this file before
// (only the pure buildSecretArchive/syncBundleFailure helpers above were
// unit-tested; createSignetAdmin's own dial was exercised only indirectly,
// through the injectable `SignetAdmin` fakes route/e2e specs use -- see
// spec/lib/fakes.ts) -- so this is new coverage, not an update to a prior
// gitOpsClient-mocking test.
describe('createSignetAdmin', () => {
  const opts: SignetAdminOptions = { address: 'signet.internal:8443', trustDomain: 'example.org', namespace: 'authstar' }

  function fakeGitOpsClient() {
    return {
      getSopsPublicKey: vi.fn((_req: unknown, cb: (err: null, response: { publicKey: string }) => void) =>
        cb(null, { publicKey: 'age1fakepublickey' })),
      syncBundle: vi.fn((cb: (err: null, response: { errors: string[] }) => void) => ({
        write: vi.fn(),
        end: vi.fn(() => cb(null, { errors: [] })),
      })),
      patchServiceConfig: vi.fn((_req: unknown, cb: (err: null) => void) => cb(null)),
      getServiceConfig: vi.fn((_req: unknown, cb: (err: null, response: { content: unknown, version: number }) => void) =>
        cb(null, { content: { generations: [1] }, version: 3 })),
    }
  }

  beforeEach(() => {
    vi.mocked(dialWorkloadGitOps).mockReset()
    vi.mocked(encryptForSecret).mockReset()
    vi.mocked(encryptForSecret).mockResolvedValue(Buffer.from('sops-ciphertext'))
  })

  it('dials via dialWorkloadGitOps with only address/trustDomain -- no token, no plaintext flag', async () => {
    const client = fakeGitOpsClient()
    vi.mocked(dialWorkloadGitOps).mockResolvedValue({ client: client as never, close: vi.fn() })

    await createSignetAdmin(opts)

    expect(dialWorkloadGitOps).toHaveBeenCalledTimes(1)
    expect(dialWorkloadGitOps).toHaveBeenCalledWith({ address: opts.address, trustDomain: opts.trustDomain })
    // Guards against a partial migration that keeps dialing correctly but
    // still smuggles a token/plaintext field into the call -- the retired
    // admin-bearer-token dial path (gitOpsClient's `token`/`plaintext: true`)
    // must be gone entirely, not merely unused.
    const callArg = vi.mocked(dialWorkloadGitOps).mock.calls[0][0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('token')
    expect(callArg).not.toHaveProperty('plaintext')
  })

  it('does not require or accept a token option', async () => {
    const client = fakeGitOpsClient()
    vi.mocked(dialWorkloadGitOps).mockResolvedValue({ client: client as never, close: vi.fn() })

    // @ts-expect-error -- SignetAdminOptions no longer declares `token`;
    // this is a compile-time proof (excess-property check on the object
    // literal) that the field was actually removed from the type, not just
    // left unused at runtime. `npm run typecheck` fails if this stops being
    // a type error (an unused @ts-expect-error is itself a tsc error).
    await createSignetAdmin({ address: opts.address, trustDomain: opts.trustDomain, namespace: opts.namespace, token: 'leftover-token' })

    // Even granting a caller that still passes a stray token through some
    // other route (e.g. `as SignetAdminOptions`), nothing token-shaped ever
    // reaches dialWorkloadGitOps.
    expect(dialWorkloadGitOps).toHaveBeenCalledWith({ address: opts.address, trustDomain: opts.trustDomain })
  })

  it('pushSecret fetches the SOPS key and syncs the bundle over the dialed workload-mTLS client', async () => {
    const client = fakeGitOpsClient()
    vi.mocked(dialWorkloadGitOps).mockResolvedValue({ client: client as never, close: vi.fn() })

    const admin = await createSignetAdmin(opts)
    await admin.pushSecret('tower', 'contactHashPepper', 'plaintext-value')

    expect(client.getSopsPublicKey).toHaveBeenCalledTimes(1)
    expect(encryptForSecret).toHaveBeenCalledWith('age1fakepublickey', 'plaintext-value')
    expect(client.syncBundle).toHaveBeenCalledTimes(1)
  })

  it('patchConfig and getConfig reuse the same dialed client as pushSecret -- one dial, not one per method', async () => {
    const client = fakeGitOpsClient()
    vi.mocked(dialWorkloadGitOps).mockResolvedValue({ client: client as never, close: vi.fn() })

    const admin = await createSignetAdmin(opts)
    await admin.patchConfig('portcullis', [])
    const config = await admin.getConfig('portcullis')

    expect(dialWorkloadGitOps).toHaveBeenCalledTimes(1)
    expect(client.patchServiceConfig).toHaveBeenCalledWith(
      { namespace: opts.namespace, service: 'portcullis', operations: [] },
      expect.any(Function),
    )
    expect(client.getServiceConfig).toHaveBeenCalledWith(
      { namespace: opts.namespace, service: 'portcullis' },
      expect.any(Function),
    )
    expect(config).toEqual({ content: { generations: [1] }, version: 3 })
  })

  it('getConfig resolves null on signetd NotFound (code 5), unaffected by the dial-path change', async () => {
    const client = fakeGitOpsClient()
    client.getServiceConfig = vi.fn((_req: unknown, cb: (err: { code: number } | null, response?: unknown) => void) =>
      cb({ code: 5 }))
    vi.mocked(dialWorkloadGitOps).mockResolvedValue({ client: client as never, close: vi.fn() })

    const admin = await createSignetAdmin(opts)
    await expect(admin.getConfig('portcullis')).resolves.toBeNull()
  })
})
