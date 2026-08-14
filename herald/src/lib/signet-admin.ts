import { gzipSync } from 'node:zlib'
import { gitOpsClient, type GitOpsServiceClient } from '@bytepunx/signet-client'

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
  token: string
  namespace: string
}

// Builds a minimal single-file USTAR archive (no external `tar` dependency
// needed for one small file) containing `secrets/<key>.yaml`, then gzips
// it -- the wire shape `GitOpsServiceClient.syncBundle` documents. Byte-
// for-byte the same construction as tower's own `signet-admin.ts` -- see
// that file's header comment for the fuller rationale (including the same
// plaintext-not-SOPS-encrypted known gap, unchanged here).
function buildSecretArchive(targetService: string, key: string, value: string): Buffer {
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
  // plaintext: true is required -- see tower's own signet-admin.ts header
  // comment for the confirmed-against-a-live-cluster reasoning, unchanged
  // here.
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
  }
}

// For contexts (default `buildApp()` wiring, existing tests, any route
// that never reaches key rotation) that don't need real signet access.
export function createNoopSignetAdmin(): SignetAdmin {
  return {
    async pushSecret() {},
  }
}
