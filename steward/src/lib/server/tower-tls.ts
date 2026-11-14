import { Agent, request as httpsRequest } from 'node:https'
import type { IncomingHttpHeaders } from 'node:http'
import type { PeerCertificate } from 'node:tls'
import { createClient, parseCertificateBundle, type SpiffeWorkloadAPIClient, type X509SVIDResponse } from 'spiffe'

// Verifies tower's certificate on this service's calls to tower, in place of
// NODE_TLS_REJECT_UNAUTHORIZED=0 (ADR 0113, I-0001). Tower serves its SPIRE
// X.509-SVID, whose only SAN is a `spiffe://` URI, so Node's own hostname
// check can never pass: this module trusts the SPIRE trust bundle for tower's
// origin alone and checks the SPIFFE trust domain instead of the hostname.
// Every other outbound call of the process keeps Node's default verification.
//
// chronicle, herald, keep, steward, and web each hold a copy of this file,
// by the operator's answer on TH-0026 (D-0021); change all five together.

/** What tower's certificate is verified against: the SPIRE trust bundle, as PEM, and the trust domain its SPIFFE ID must belong to. */
export interface TowerTrust {
  caPem: string
  trustDomain: string
}

interface WatchOptions {
  client?: Pick<SpiffeWorkloadAPIClient, 'fetchX509SVID'>
  onStreamEnd?: (err?: unknown) => void
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

function spiffeIdOf(subjectaltname: string | undefined): string | undefined {
  if (!subjectaltname) return undefined
  // Node formats SANs as one comma-separated string, such as
  // "DNS:a.example, URI:spiffe://td/ns/authstar/sa/tower".
  return /URI:(spiffe:\/\/[^,\s]+)/.exec(subjectaltname)?.[1]
}

/** A checkServerIdentity that accepts a peer whose SPIFFE ID is in trustDomain, in place of Node's hostname check. */
export function checkSpiffeServerIdentity(trustDomain: string): (host: string, cert: PeerCertificate) => Error | undefined {
  return (host, cert) => {
    const spiffeId = spiffeIdOf(cert.subjectaltname)
    if (!spiffeId) {
      return new Error(`tower's certificate for ${host} carries no SPIFFE ID; check that tower serves its SPIRE SVID`)
    }
    if (!spiffeId.startsWith(`spiffe://${trustDomain}/`)) {
      return new Error(
        `tower's certificate for ${host} names ${spiffeId}, outside trust domain ${trustDomain}; check tower's SPIRE registration`,
      )
    }
    return undefined
  }
}

function headersOf(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
  }
  return headers
}

/** A fetch for tower's https origin that verifies tower's certificate against the trust currentTrust answers at each call. */
export function createTowerFetch(currentTrust: () => TowerTrust): typeof fetch {
  const agent = new Agent({ keepAlive: true })
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.protocol !== 'https:') {
      throw new Error(`the tower fetch reaches tower over https only, not ${url.href}; call plain fetch for an http:// tower URL`)
    }
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined
    const trust = currentTrust()
    return new Promise<Response>((resolve, reject) => {
      const outgoing = httpsRequest(
        url,
        {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          agent,
          ca: trust.caPem,
          checkServerIdentity: checkSpiffeServerIdentity(trust.trustDomain),
          signal: request.signal,
        },
        (incoming) => {
          const chunks: Buffer[] = []
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
          incoming.on('error', reject)
          incoming.on('end', () => {
            const status = incoming.statusCode ?? 502
            resolve(
              new Response(NULL_BODY_STATUSES.has(status) ? null : new Uint8Array(Buffer.concat(chunks)), {
                status,
                statusText: incoming.statusMessage,
                headers: headersOf(incoming.headers),
              }),
            )
          })
        },
      )
      outgoing.on('error', reject)
      outgoing.end(body)
    })
  }
}

function trustOf(message: X509SVIDResponse): TowerTrust | undefined {
  const svid = message.svids[0]
  if (!svid) return undefined
  return {
    caPem: parseCertificateBundle(svid.bundle).toString('pem-chain'),
    trustDomain: new URL(svid.spiffeId).host,
  }
}

function exitOnStreamEnd(err?: unknown): void {
  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: 'fatal',
      component: 'tower-tls',
      msg: 'spiffe workload api stream ended, cannot follow the trust bundle',
      err: err === undefined ? undefined : String(err),
    })}\n`,
  )
  process.exit(1)
}

/** Streams this workload's SVID context from the SPIFFE Workload API and answers a getter for the latest trust once the first arrives. */
export async function watchTowerTrust(options: WatchOptions = {}): Promise<() => TowerTrust> {
  const client = options.client ?? createClient()
  const onStreamEnd = options.onStreamEnd ?? exitOnStreamEnd
  const responses = client.fetchX509SVID({}).responses[Symbol.asyncIterator]()
  const next = async (): Promise<TowerTrust | undefined> => {
    for (;;) {
      const result = await responses.next()
      if (result.done) return undefined
      const trust = trustOf(result.value)
      if (trust) return trust
    }
  }
  let current = await next()
  if (!current) {
    throw new Error(
      'the SPIFFE Workload API closed its FetchX509SVID stream before it sent an SVID; check SPIFFE_ENDPOINT_SOCKET and the SPIRE agent',
    )
  }
  void (async () => {
    for (let trust = await next(); trust; trust = await next()) current = trust
  })().then(
    () => onStreamEnd(),
    (err: unknown) => onStreamEnd(err),
  )
  return () => current as TowerTrust
}

/** The fetch this service calls tower with: plain fetch for an http:// base URL, the trust-bundle fetch for https://. */
export async function towerFetchFor(towerBaseUrl: string, options: WatchOptions = {}): Promise<typeof fetch> {
  const { protocol } = new URL(towerBaseUrl)
  if (protocol === 'http:') return (input, init) => fetch(input, init)
  if (protocol !== 'https:') {
    throw new Error(`tower's base URL ${towerBaseUrl} is neither http:// nor https://; fix towerBaseUrl`)
  }
  if (!options.client && !process.env.SPIFFE_ENDPOINT_SOCKET) {
    throw new Error(
      `tower's base URL ${towerBaseUrl} is https, but SPIFFE_ENDPOINT_SOCKET is unset; set it to the SPIRE agent's socket so tower's certificate can be verified, or use an http:// URL`,
    )
  }
  return createTowerFetch(await watchTowerTrust(options))
}
