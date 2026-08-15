import { gzipSync } from 'node:zlib'
import { gitOpsClient, type GitOpsServiceClient, type adminv1 } from '@bytepunx/signet-client'

// ADR 0067's tenant-provisioning flow needs tower to push four secrets
// (session signing key, internal signing key, `identity-hash-key`
// generation 1 -- all three into *portcullis's* bundle -- and
// `contact-hash-pepper` into tower's *own* bundle) using the elevated
// signet admin access ADR 0011 grants tower. This is a narrow interface
// (not the full signet-client surface) so behavior/e2e tests can inject a
// fake, exactly like `ContactStore`/`Publisher`.
export interface SignetAdmin {
  pushSecret(targetService: 'tower' | 'portcullis', key: string, value: string): Promise<void>
  /**
   * Atomically applies a JSON Patch (RFC 6902, bytepunx/signet-client's
   * jsonPatch* helpers build the individual operations) to targetService's
   * plain config document (ADR 0088's key-rotation producer, bytepunx/signet#38)
   * -- unlike pushSecret/SyncBundle, this never reads or replaces the whole
   * document, only the paths the caller names. Fails if no config document
   * exists yet for targetService (signet's own PatchServiceConfig contract).
   */
  patchConfig(targetService: 'tower' | 'portcullis', operations: adminv1.JsonPatchOperation[]): Promise<void>
}

export interface SignetAdminOptions {
  address: string
  token: string
  namespace: string
}

// Builds a minimal single-file USTAR archive (no external `tar` dependency
// needed for one small file) containing `secrets/<namespace>/<service>/
// <key>.yaml`, then gzips it -- the wire shape `GitOpsServiceClient.
// syncBundle` documents (`SyncBundleHeader` + raw tar.gz `data` chunks, see
// `signet-clients/typescript/src/gen/admin/v1/admin.ts`). The 3-segment
// path is required: signetd's own `ParseSecretPath` (signet/internal/
// gitops/path.go) rejects anything else as unrecognised and silently
// *skips* it (reported only in `SyncBundleResponse.errors`, not as an RPC
// error) -- a real bug this repo shipped with (missing the namespace
// segment entirely, `opts.namespace` was received and then explicitly
// discarded, `void opts.namespace` below) that made every `pushSecret`
// call silently no-op while still resolving successfully. See
// `pushSecret`'s own comment for the other half of that fix (checking the
// response, not just the transport-level error).
//
// KNOWN GAP, confirmed live, not just theoretical: signet's GitOps sync
// path is designed around SOPS-encrypted secret files (the service also
// exposes `GetSOPSPublicKey`) -- this pushes the secret value as
// **plaintext** YAML inside the archive, not SOPS-encrypted. A plaintext
// push *appears* to succeed (the RPC returns cleanly), but signetd's own
// periodic gitops reconciler re-processes every tracked secret path --
// including ones written via a direct SyncBundle admin push, not just
// git-synced ones -- and tries to SOPS-decrypt each one. A plaintext
// value fails that with "sops decrypt: parse sops file: sops metadata
// not found" (confirmed directly in signetd's own logs against a live
// cluster, reproduced twice), so the secret survives only until the next
// reconciliation cycle (~1 minute in that deployment) and then silently
// becomes permanently unreadable -- with no error surfaced anywhere on
// the read side. No client in `signet-clients` (any language, including
// Go's own reference implementation) provides a helper to actually
// produce SOPS-compatible ciphertext -- filed as
// bytepunx/signet-clients#49. Blocked on that landing; nothing this repo
// owns can fix it (real in-process age+SOPS-format encryption, or
// shelling out to a bundled `sops` binary, belongs in the shared client
// library every consumer depends on, not reimplemented per-repo).
export function buildSecretArchive(namespace: string, targetService: 'tower' | 'portcullis', key: string, value: string): Buffer {
  const path = `secrets/${namespace}/${targetService}/${key}.yaml`
  const content = Buffer.from(`value: ${JSON.stringify(value)}\n`, 'utf8')

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
// without a real (or mocked) gRPC client -- exactly the check that was
// missing before, see `buildSecretArchive`'s own comment.
//
// `errors` alone, not also `secretsAdded + secretsUpdated === 0` -- found
// live, the hard way, immediately after adding that second condition: a
// real idempotent re-push (this exact value already stored from a prior
// sync -- e.g. tower's own provisioning route pushes the same
// `defaultProviderClientSecret` on every `POST /tenants` call, not just
// the first) correctly produces zero added/zero updated *with zero
// errors*, and that first version of this function misreported the
// legitimate no-op as a failure. signetd's own `SyncBundle` handler
// (`internal/gitops/sync.go`) appends every genuinely-skipped file to
// `result.Skipped`, always surfaced via `errors` -- there is no rejection
// path that produces zero errors, so checking `errors` alone is both
// necessary and sufficient to catch the real bug class this guards
// against (a malformed path silently skipped) without flagging a
// harmless re-push of unchanged content.
export function syncBundleFailure(response: { errors: string[] }): string | null {
  if (response.errors.length > 0) return response.errors.join('; ')
  return null
}

export function createSignetAdmin(opts: SignetAdminOptions): SignetAdmin {
  // plaintext: true is required, not optional: signet's admin/GitOps listener never
  // terminates TLS itself, even reached by its in-cluster DNS name (a non-loopback
  // address) -- per signet-clients' own DialAdminOptions.plaintext doc comment,
  // omitting this makes the client's loopback heuristic pick TLS and the handshake
  // fails immediately ("wrong version number") against a server that never speaks
  // TLS on that port. Confirmed for real against a live cluster: SIGNET_ADMIN_ADDR
  // is signet.signet.svc.cluster.local:8444, and self-service tenant provisioning
  // 500'd with exactly that OpenSSL error before this was added.
  const client: GitOpsServiceClient = gitOpsClient({ address: opts.address, token: opts.token, plaintext: true })

  return {
    pushSecret(targetService, key, value) {
      return new Promise<void>((resolve, reject) => {
        // `err` is only a transport/RPC-level failure -- signetd reports a
        // rejected (unrecognised-path-shape) secret as a *successful* RPC
        // with the problem described in `response.errors` instead (see
        // `buildSecretArchive`'s own comment for why this matters: this
        // exact blind spot let a real path-building bug silently no-op
        // every push for as long as this code went unexercised).
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
        const archive = buildSecretArchive(opts.namespace, targetService, key, value)
        call.write({ data: archive } as never)
        call.end()
      })
    },
    patchConfig(targetService, operations) {
      return new Promise<void>((resolve, reject) => {
        client.patchServiceConfig(
          { namespace: opts.namespace, service: targetService, operations },
          (err) => (err ? reject(err) : resolve()),
        )
      })
    },
  }
}

// For contexts (default `buildApp()` wiring, existing tests, any route
// that never reaches provisioning) that don't need real signet access.
export function createNoopSignetAdmin(): SignetAdmin {
  return {
    async pushSecret() {},
    async patchConfig() {},
  }
}
