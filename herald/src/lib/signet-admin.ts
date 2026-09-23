import { gzipSync } from 'node:zlib'
import { dialWorkloadGitOps, encryptForSecret } from '@bytepunx/signet-client'

// ADR 0081's key-rotation route needs herald to push secrets into two
// places: its *own* bundle (the full generation set, so a restart doesn't
// strand already-encrypted `communication`s or already-mailed unsubscribe
// links under a generation it no longer has) and every publisher's bundle
// (the current payload-encryption *public* key + version, ADR 0025's
// distribution mechanism). Same narrow interface tower's own
// `signet-admin.ts` exposes, for the same reason -- behavior/e2e tests
// inject a fake, exactly like `PayloadKeyring`/`ContactStore` elsewhere in
// this codebase.
export interface SignetAdmin {
  pushSecret(targetService: 'herald' | 'tower' | 'keep' | 'portcullis', key: string, value: string): Promise<void>
}

export interface SignetAdminOptions {
  address: string
  trustDomain: string
  namespace: string
}

// Builds a minimal single-file USTAR archive (no external `tar` dependency
// needed for one small file) containing `secrets/<namespace>/<service>/
// <key>.yaml`, then gzips it -- the wire shape `GitOpsServiceClient.
// syncBundle` documents. Byte-for-byte the same construction as tower's
// own `signet-admin.ts` -- see that file's header comment for the fuller
// rationale, AND for a real incident this exact file caused: the path
// used to omit the namespace segment entirely (`opts.namespace` was
// received and explicitly discarded, `void opts.namespace`), which
// signetd's real `ParseSecretPath` silently rejects -- the RPC still
// resolves successfully, so `POST /operator/rotate-keys` reported success
// while tower never actually received herald's public key. Fixed
// identically in both files; see tower's own signet-admin.ts and
// syncBundleFailure for the other half of that fix (checking the
// response, not just the transport-level error).
//
// FIXED (was a separate, still-open gap at the time): a plaintext push
// used to appear to succeed but never durably persist -- signetd's own
// periodic reconciler rejected a plaintext value on its next pass ("sops
// decrypt: parse sops file: sops metadata not found"). Filed as
// bytepunx/signet-clients#49; fixed upstream (`encryptForSecret`,
// `@bytepunx/signet-client` >=0.6.0) -- see tower's own signet-admin.ts
// and `pushSecret`'s own comment here for how it's used. `content` below
// is now always real SOPS ciphertext, never a raw plaintext `value: ...`
// YAML leaf.
export function buildSecretArchive(namespace: string, targetService: string, key: string, content: Uint8Array): Buffer {
  const path = `secrets/${namespace}/${targetService}/${key}.yaml`

  const header = Buffer.alloc(512)
  header.write(path, 0, 'utf8')
  header.write('0000644', 100, 'utf8') // mode
  header.write('0000000', 108, 'utf8') // uid
  header.write('0000000', 116, 'utf8') // gid
  header.write(content.length.toString(8).padStart(11, '0'), 124, 'utf8') // size (octal)
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0'), 136, 'utf8') // mtime
  header.write('        ', 148, 'utf8') // checksum placeholder (8 spaces)
  header.write('0', 156, 'utf8') // typeflag: regular file
  header.write('ustar', 257, 'utf8')
  header.write('00', 263, 'utf8')

  let checksum = 0
  for (let i = 0; i < 512; i++) checksum += header[i]
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')

  const contentPadding = Buffer.alloc((512 - (content.length % 512)) % 512)
  const endBlocks = Buffer.alloc(1024) // two zero-filled 512-byte end-of-archive blocks

  const tar = Buffer.concat([header, content, contentPadding, endBlocks])
  return gzipSync(tar)
}

// Pure so it's directly unit-testable against a fake `SyncBundleResponse`
// without a real (or mocked) gRPC client. Identical to tower's own
// signet-admin.ts export of the same name -- including a real, live-found
// correction: an earlier version of this function also checked
// `secretsAdded + secretsUpdated === 0`, which misreported a genuine
// idempotent re-push (unchanged value, zero errors) as a failure.
// signetd's own SyncBundle handler always surfaces a genuinely-skipped
// file via `errors` -- zero errors is unambiguously success regardless of
// the add/update counts, so those counts add nothing this check needs.
export function syncBundleFailure(response: { errors: string[] }): string | null {
  if (response.errors.length > 0) return response.errors.join('; ')
  return null
}

// Per ADR 0103, herald authenticates its own GitOps writes (own-bundle
// SyncBundle plus the tower/keep/portcullis cross-service pushes ADR 0081
// needs) with its own workload SPIFFE identity instead of the retired
// admin bearer token -- the same `DialWorkloadOptions` shape (`address` +
// `trustDomain`) `dialWorkload` already uses for herald's ordinary bundle
// fetch in server.ts. `dialWorkloadGitOps` always dials real workload
// mTLS, so there's no `plaintext`/loopback heuristic to carry over from
// the old bearer-token dial path -- that was specific to gitOpsClient's
// token-based dial, not applicable here.
export async function createSignetAdmin(opts: SignetAdminOptions): Promise<SignetAdmin> {
  const { client } = await dialWorkloadGitOps({ address: opts.address, trustDomain: opts.trustDomain })

  return {
    async pushSecret(targetService, key, value) {
      // Fetched fresh on every call, not cached -- see tower's own
      // signet-admin.ts for why (a stale cached key across a SOPS key
      // rotation would silently reintroduce the same "appears to
      // succeed, never actually readable" failure mode).
      const sopsKey = await new Promise<string>((resolve, reject) => {
        client.getSopsPublicKey({}, (err, response) => (err ? reject(err) : resolve(response.publicKey)))
      })
      const encrypted = await encryptForSecret(sopsKey, value)

      await new Promise<void>((resolve, reject) => {
        const call = client.syncBundle((err, response) => {
          if (err) {
            reject(err)
            return
          }
          const failure = syncBundleFailure(response)
          if (failure) {
            reject(new Error(`signet rejected pushSecret(${targetService}, ${key}): ${failure}`))
          } else {
            resolve()
          }
        })
        call.write({
          header: { secretsPath: 'secrets/', headSha: '', configPath: '' },
        } as never)
        const archive = buildSecretArchive(opts.namespace, targetService, key, encrypted)
        call.write({ data: archive } as never)
        call.end()
      })
    },
  }
}

// For contexts (default `buildApp()` wiring, existing tests, any route
// that never reaches key rotation) that don't need real signet access.
export function createNoopSignetAdmin(): SignetAdmin {
  return {
    async pushSecret() {},
  }
}
