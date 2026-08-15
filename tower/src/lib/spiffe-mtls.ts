import { createClient, parseCertificateBundle } from 'spiffe'
import { createPrivateKey } from 'node:crypto'
import type { TLSSocket } from 'node:tls'
import type { preHandlerHookHandler } from 'fastify'

// Real fastify-level SPIFFE mTLS for `/enrich` and `/identities/resolve`
// (`routes/enrich.ts`/`routes/identities.ts`) -- portcullis's own two
// calls into tower, and the only two routes that need a validated client
// certificate at all (every other route on this same server is
// JWT/operator-bearer authenticated, unaffected by any of this). Tower
// previously had zero TLS termination -- plain fastify, `app.listen()`
// straight to HTTP -- so east-west mTLS only ever "worked" because it was
// pointed at `http://` and TLS never actually engaged. This closes that
// gap using the `spiffe` npm package (already a transitive dependency via
// `@bytepunx/signet-client`), the Node-side equivalent of portcullis's own
// real client-side mTLS (`~/git/authstar/portcullis/crates/
// authstar-config/src/mtls.rs`, built on `spiffe_rustls`).

export interface SpiffeServerCredentials {
  cert: string
  key: string
  ca: string
}

// Fetches tower's own X.509-SVID (server certificate + private key) and
// the trust-domain CA bundle needed to validate a peer's client
// certificate, via the SPIFFE Workload API (`SPIFFE_ENDPOINT_SOCKET`-based
// unix socket, the same one `dialWorkload` connects through for tower's
// own outbound signet dialing -- this is the separate, inbound-facing
// half: tower's own server identity, not a client dial). Resolves on the
// *first* message from the (indefinitely-streaming) `FetchX509SVID` RPC --
// certificate rotation is handled by re-fetching at process restart, the
// same "no hot-reload, a bundle/config change triggers a clean exit and
// lets Kubernetes restart into a fresh fetch" posture `server.ts`'s own
// header comment already documents for signet, not a new pattern this
// introduces.
export async function fetchServerCredentials(): Promise<SpiffeServerCredentials> {
  const client = createClient()
  const rpc = client.fetchX509SVID({})
  for await (const message of rpc.responses) {
    if (message.svids.length === 0) continue
    const svid = message.svids[0]
    // `x509Svid` is DER, leaf-first, MAY include intermediates --
    // `parseCertificateBundle` (not `parseCertificate`, which is
    // documented to mis-parse a multi-cert chain) handles both cases
    // uniformly and produces a PEM chain `https.createServer`'s own
    // `cert` option accepts directly.
    const cert = parseCertificateBundle(svid.x509Svid).toString('pem-chain')
    const key = createPrivateKey({ key: Buffer.from(svid.x509SvidKey), format: 'der', type: 'pkcs8' })
      .export({ format: 'pem', type: 'pkcs8' }) as string
    const ca = parseCertificateBundle(svid.bundle).toString('pem-chain')
    return { cert, key, ca }
  }
  throw new Error('SPIFFE Workload API closed its FetchX509SVID stream without ever returning an SVID')
}

function extractSpiffeId(subjectaltname: string | undefined): string | undefined {
  if (!subjectaltname) return undefined
  // Node formats a peer certificate's SAN as a single comma-separated
  // string, e.g. `"DNS:example.com, URI:spiffe://trust-domain/workload"` --
  // confirmed directly against Node's own `tls.PeerCertificate` behavior,
  // not assumed.
  const match = /URI:(spiffe:\/\/\S+?)(?:,|$)/.exec(subjectaltname)
  return match?.[1]
}

// Fastify-level, not a whole-server TLS requirement: the underlying
// `https.Server` (wired in `build-app.ts` via the `tls` option) is
// configured `requestCert: true, rejectUnauthorized: false` -- it accepts
// a connection regardless of whether a valid client certificate was
// presented, so every other route on this same server keeps working over
// plain JWT/operator-bearer auth. Enforcement -- "was a *valid* cert
// presented, and does its SPIFFE ID belong to this trust domain" -- only
// happens here, as an ordinary `preHandler`, on the two routes that opt
// into it.
//
// Matches portcullis's own east-west authorization posture exactly
// (`mtls.rs`: `authorizer::trust_domains([trust_domain])`, "authorizes any
// SPIFFE ID within that trust domain, not a specific one") -- not a
// portcullis-specific allowlist. Any workload this installation's own
// trust domain issued a certificate to is accepted, the same policy on
// both sides of this same relationship, not a stricter or different one
// invented for this one direction.
export function requireSpiffePeer(trustDomain: string): preHandlerHookHandler {
  return async (request, reply) => {
    const socket = request.raw.socket as TLSSocket
    if (typeof socket.getPeerCertificate !== 'function' || !socket.authorized) {
      return reply.code(403).send({ error: 'a validated SPIFFE client certificate is required' })
    }
    const cert = socket.getPeerCertificate()
    const spiffeId = extractSpiffeId(cert.subjectaltname)
    if (!spiffeId || !spiffeId.startsWith(`spiffe://${trustDomain}/`)) {
      return reply.code(403).send({ error: 'client certificate is not a valid SPIFFE ID for this trust domain' })
    }
  }
}
