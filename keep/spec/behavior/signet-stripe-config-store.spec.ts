import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Behavior tier for `createSignetStripeConfigStore` (ADR 0103 / Story 009):
// verifies the dial re-point from ADR 0052's admin-bearer-token
// `gitOpsClient({ token, plaintext: true })` to ADR 0103's SPIFFE-mTLS
// `dialWorkloadGitOps({ address, trustDomain })` -- keep's own workload SVID
// authenticates the GitOps write directly, no token, no `CreatePolicy`
// grant, since keep only ever writes its own bundle. This module previously
// had no dedicated test coverage of its own (`stripe-config.spec.ts` only
// exercises the fake in-memory store `test-app.ts` wires in its place); this
// file is new, added as part of Story 009's client-library re-point.
//
// `@bytepunx/signet-client` is mocked at the module boundary -- there is no
// DI seam inside `createSignetStripeConfigStore` itself for the dialed
// GitOpsServiceClient (unlike `StripeConfigStore`, which *is* the seam
// higher-level code tests against, per that file's own top comment), so a
// fake `GitOpsServiceClient` bound to the mocked `dialWorkloadGitOps` return
// value is the only way to exercise this module's own push logic in
// isolation.

const getSopsPublicKey = vi.fn()
const syncBundleWrite = vi.fn()
const syncBundleEnd = vi.fn()
let syncBundleCallback: ((err: Error | null, response: { errors: string[] }) => void) | undefined
const syncBundle = vi.fn((callback: (err: Error | null, response: { errors: string[] }) => void) => {
  syncBundleCallback = callback
  return { write: syncBundleWrite, end: syncBundleEnd }
})
const close = vi.fn()

const dialWorkloadGitOps = vi.fn(async () => ({
  client: { getSopsPublicKey, syncBundle } as never,
  close,
}))

const encryptForSecret = vi.fn(async (publicKey: string, value: string | Uint8Array) => Buffer.from(`sops(${publicKey}:${value})`, 'utf8'))

vi.mock('@bytepunx/signet-client', () => ({
  dialWorkloadGitOps: (...args: unknown[]) => dialWorkloadGitOps(...(args as [])),
  encryptForSecret: (...args: [string, string | Uint8Array]) => encryptForSecret(...args),
}))

// Imported after the mock is registered (vi.mock is hoisted above imports by
// vitest regardless of statement order, but kept below for readability).
const { createSignetStripeConfigStore } = await import('../../src/lib/signet-stripe-config-store.js')

function resolveSyncBundleSuccess(): void {
  syncBundleCallback?.(null, { errors: [] })
}

describe('createSignetStripeConfigStore', () => {
  beforeEach(() => {
    getSopsPublicKey.mockReset()
    getSopsPublicKey.mockImplementation((_req: unknown, callback: (err: Error | null, response: { publicKey: string }) => void) => {
      callback(null, { publicKey: 'age1testkey' })
    })
    syncBundleWrite.mockClear()
    syncBundleEnd.mockClear()
    syncBundleCallback = undefined
    syncBundle.mockClear()
    close.mockClear()
    dialWorkloadGitOps.mockClear()
    encryptForSecret.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dials via dialWorkloadGitOps with address and trustDomain -- no token field, ADR 0103', async () => {
    await createSignetStripeConfigStore({
      address: 'signet.internal:8443',
      trustDomain: 'authstar.example',
      initialSecrets: {},
    })

    expect(dialWorkloadGitOps).toHaveBeenCalledTimes(1)
    expect(dialWorkloadGitOps).toHaveBeenCalledWith({ address: 'signet.internal:8443', trustDomain: 'authstar.example' })
  })

  it('does not forward a legacy token field even if a caller supplies one -- nothing left to source it from', async () => {
    // Deliberately widen the type to simulate a caller still holding onto
    // the retired `token` option (e.g. mid-migration or stale call site) --
    // `SignetStripeConfigStoreOptions` no longer declares `token` at all, so
    // this can only be constructed via an explicit cast, not accidentally.
    const legacyOpts = {
      address: 'signet.internal:8443',
      trustDomain: 'authstar.example',
      token: 'stale-admin-token-should-be-ignored',
      initialSecrets: {},
    } as unknown as Parameters<typeof createSignetStripeConfigStore>[0]

    await createSignetStripeConfigStore(legacyOpts)

    expect(dialWorkloadGitOps).toHaveBeenCalledWith({ address: 'signet.internal:8443', trustDomain: 'authstar.example' })
    const dialArgs = dialWorkloadGitOps.mock.calls[0]?.[0] as Record<string, unknown>
    expect(dialArgs).not.toHaveProperty('token')
  })

  it('get() reflects initialSecrets before any set()', async () => {
    const store = await createSignetStripeConfigStore({
      address: 'signet.internal:8443',
      trustDomain: 'authstar.example',
      initialSecrets: {
        'stripe-secret-key-acme': 'sk_live_existing',
        'stripe-webhook-secret-acme': 'whsec_existing',
      },
    })

    await expect(store.get('acme')).resolves.toEqual({ secretKey: 'sk_live_existing', webhookSecret: 'whsec_existing' })
  })

  it('set() fetches the SOPS public key, SOPS-encrypts, and pushes via syncBundle -- then get() reflects the update', async () => {
    const store = await createSignetStripeConfigStore({
      address: 'signet.internal:8443',
      trustDomain: 'authstar.example',
      initialSecrets: {},
    })

    const setPromise = store.set('acme', { secretKey: 'sk_live_new', webhookSecret: 'whsec_new' })

    // Two pushSecret calls (secret key, then webhook secret), each awaiting
    // its own syncBundle round trip -- resolve them in turn.
    await vi.waitFor(() => expect(syncBundle).toHaveBeenCalledTimes(1))
    resolveSyncBundleSuccess()
    await vi.waitFor(() => expect(syncBundle).toHaveBeenCalledTimes(2))
    resolveSyncBundleSuccess()

    await setPromise

    expect(getSopsPublicKey).toHaveBeenCalledTimes(2)
    expect(encryptForSecret).toHaveBeenCalledWith('age1testkey', 'sk_live_new')
    expect(encryptForSecret).toHaveBeenCalledWith('age1testkey', 'whsec_new')
    // Each push writes a header chunk then a data chunk before ending the stream.
    expect(syncBundleWrite).toHaveBeenCalledTimes(4)
    expect(syncBundleEnd).toHaveBeenCalledTimes(2)

    await expect(store.get('acme')).resolves.toEqual({ secretKey: 'sk_live_new', webhookSecret: 'whsec_new' })
  })

  it('set() rejects when signetd reports rejected paths via response.errors, even though the RPC itself succeeded', async () => {
    const store = await createSignetStripeConfigStore({
      address: 'signet.internal:8443',
      trustDomain: 'authstar.example',
      initialSecrets: {},
    })

    const setPromise = store.set('acme', { secretKey: 'sk_live_new', webhookSecret: 'whsec_new' })
    await vi.waitFor(() => expect(syncBundle).toHaveBeenCalledTimes(1))
    syncBundleCallback?.(null, { errors: ['path rejected: secrets/stripe-secret-key-acme.yaml'] })

    await expect(setPromise).rejects.toThrow(/signet rejected stripe-config push/)
  })
})
