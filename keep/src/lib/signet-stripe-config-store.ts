import { gzipSync } from 'node:zlib'
import { gitOpsClient, encryptForSecret, type GitOpsServiceClient } from '@bytepunx/signet-client'
import type { StripeConfigStore, TenantStripeConfig } from './stripe-config.js'

// ADR 0052's real wiring for keep's own `stripe-config` route --
// stripe-config.ts's own top-of-file comment calls this "out of scope for
// this pilot slice"; this is that follow-up.
//
// Unlike tower's `signet-admin.ts` (ADR 0011: a cross-service admin token
// that can push into *other* services' bundles), ADR 0052 gives keep a
// narrower token scoped to its **own** bundle only -- so there is no
// `targetService` parameter here, and the archive path is always
// `secrets/<key>.yaml`, never `secrets/<service>/<key>.yaml`.
//
// `get()` reads from an in-memory snapshot taken once at process startup
// (the secrets already decoded off the `GetServiceBundle` response
// `src/server.ts` fetches) -- consistent with this codebase's documented
// "no hot-reload" design (see `src/server.ts`'s own top comment): a `set()`
// push changes keep's own bundle, which is exactly the kind of change the
// standard watch/restart-lock loop reacts to by exiting cleanly so the next
// process instance picks up the new secret on its own fresh fetch. `set()`
// also updates the local snapshot optimistically so a `GET` immediately
// following a `PATCH` in the same process (before the bundle watch has had
// a chance to trigger a restart) reflects the just-written value -- keep's
// own PATCH/GET pair is commonly called back-to-back by web's admin UI.
//
// FIXED (was a known gap, carried over verbatim from tower's own
// `signet-admin.ts` before *that* was fixed): this used to push the secret
// value as plaintext YAML inside the archive, not SOPS-encrypted --
// signetd's periodic gitops reconciler tries to SOPS-decrypt every tracked
// secret path regardless of how it arrived, so a plaintext push appeared to
// succeed but silently became permanently unreadable after the next
// reconciliation cycle (bytepunx/signet-clients#49, same bug, same fix:
// `encryptForSecret`, `@bytepunx/signet-client` >=0.6.0). `content` below is
// now always real SOPS ciphertext.
//
// Also now checks `response.errors` (previously discarded entirely) --
// signetd reports a rejected/unrecognised path as a *successful* RPC with
// the problem described in `response.errors`, not as a transport error, so
// checking only `err` missed exactly the same class of silent-no-op bug
// tower's own `pushSecret` had.

function secretKeyName(tenantSlug: string): string {
  return `stripe-secret-key-${tenantSlug}`
}

function webhookSecretKeyName(tenantSlug: string): string {
  return `stripe-webhook-secret-${tenantSlug}`
}

// Same minimal single-file USTAR-archive-then-gzip approach as tower's
// `signet-admin.ts` `buildSecretArchive` -- duplicated rather than shared
// across services since these are two separate packages with no shared
// internal library between them in this pilot slice, and the function is
// small enough that the duplication cost is low compared to introducing a
// cross-service dependency for it. `content` is `encryptForSecret`'s own
// output (real SOPS ciphertext) -- never a raw plaintext value, same as
// tower's own `buildSecretArchive`.
function buildSecretArchive(key: string, content: Uint8Array): Buffer {
  const path = `secrets/${key}.yaml`

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

export interface SignetStripeConfigStoreOptions {
  address: string
  token: string
  // Decoded secrets off keep's own `GetServiceBundle` response, fetched
  // once at startup by src/server.ts -- see the file comment above for why
  // this is a one-time snapshot, not a live lookup.
  initialSecrets: Record<string, string>
}

export function createSignetStripeConfigStore(opts: SignetStripeConfigStoreOptions): StripeConfigStore {
  // plaintext: true is required, not optional: signet's admin/GitOps listener never
  // terminates TLS itself, even reached by its in-cluster DNS name (a non-loopback
  // address) -- per signet-clients' own DialAdminOptions.plaintext doc comment,
  // omitting this makes the client's loopback heuristic pick TLS and the handshake
  // fails immediately ("wrong version number") against a server that never speaks
  // TLS on that port. Confirmed for real against a live cluster (same bug found and
  // fixed in tower's signet-admin.ts).
  const client: GitOpsServiceClient = gitOpsClient({ address: opts.address, token: opts.token, plaintext: true })
  const secrets = new Map<string, string>(Object.entries(opts.initialSecrets))

  async function pushSecret(key: string, value: string): Promise<void> {
    // Fetched fresh on every call rather than cached -- infrequent calls
    // (an operator setting Stripe config), and a stale cached key would
    // encrypt to a recipient signetd's already rotated away from, same
    // reasoning as tower's own `pushSecret`.
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
        if (response.errors.length > 0) {
          reject(new Error(`signet rejected stripe-config push for ${key}: ${response.errors.join('; ')}`))
        } else {
          resolve()
        }
      })
      call.write({
        header: { secretsPath: 'secrets/', headSha: '', configPath: '' },
      } as never)
      call.write({ data: buildSecretArchive(key, encrypted) } as never)
      call.end()
    })
  }

  return {
    async get(tenantSlug: string): Promise<TenantStripeConfig | undefined> {
      const secretKey = secrets.get(secretKeyName(tenantSlug))
      const webhookSecret = secrets.get(webhookSecretKeyName(tenantSlug))
      if (!secretKey || !webhookSecret) return undefined
      return { secretKey, webhookSecret }
    },
    async set(tenantSlug: string, config: TenantStripeConfig): Promise<void> {
      await pushSecret(secretKeyName(tenantSlug), config.secretKey)
      await pushSecret(webhookSecretKeyName(tenantSlug), config.webhookSecret)
      secrets.set(secretKeyName(tenantSlug), config.secretKey)
      secrets.set(webhookSecretKeyName(tenantSlug), config.webhookSecret)
    },
  }
}
