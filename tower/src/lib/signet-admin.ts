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
// needed for one small file) containing `secrets/<key>.yaml`, then gzips
// it -- the wire shape `GitOpsServiceClient.syncBundle` documents
// (`SyncBundleHeader` + raw tar.gz `data` chunks, see
// `signet-clients/typescript/src/gen/admin/v1/admin.ts`).
//
// KNOWN GAP, flagged here rather than glossed over: signet's GitOps sync
// path is designed around SOPS-encrypted secret files (the service also
// exposes `GetSOPSPublicKey`) -- this pushes the secret value as
// **plaintext** YAML inside the archive, not SOPS-encrypted. Getting the
// encryption step right needs either shelling out to the real `sops` CLI
// (not a dependency of this repo) or an in-process age-encryption library,
// and the exact per-service directory layout `secretsPath` expects
// (single file vs. one-file-per-key) isn't pinned down anywhere this pilot
// slice's research could confirm without deeper access to signet's own
// server source. This wiring is real (real RPC, real streaming, real
// auth) and has not been validated against a live signet -- see
// TESTING.md and this project's final report for the explicit scope note.
function buildSecretArchive(targetService: 'tower' | 'portcullis', key: string, value: string): Buffer {
  const path = `secrets/${targetService}/${key}.yaml`
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
        const call = client.syncBundle((err) => {
          if (err) reject(err)
          else resolve()
        })
        call.write({
          header: { secretsPath: 'secrets/', headSha: '', configPath: '' },
        } as never)
        const archive = buildSecretArchive(targetService, key, value)
        call.write({ data: archive } as never)
        call.end()
        void opts.namespace
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
