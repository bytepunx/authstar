import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import https from 'node:https'
import tls from 'node:tls'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import { watchSVIDRotation, type SecureContextTarget, type SvidMessage } from '../../src/lib/spiffe-mtls.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { generateTestCa, generateLeafCert, type GeneratedCa, type GeneratedCert } from '../lib/spiffe-test-certs.js'

// I-0002: tower's X.509-SVID used to be fetched once at boot, so after
// SPIRE's 4h TTL every new mTLS handshake failed on an expired certificate.
// `watchSVIDRotation` applies each SVID the Workload API pushes with
// `setSecureContext`. This proves it over real TLS handshakes, as
// `spiffe-mtls.spec.ts` does, since `app.inject()` never performs one: tower
// starts on an already-expired SVID, the test pushes its successor through
// the watch's injected stream, and new handshakes then see the successor.

const TRUST_DOMAIN = 'test.trust.domain'
const TOWER_ID = `spiffe://${TRUST_DOMAIN}/tower`

// A push-driven stand-in for the Workload API's FetchX509SVID stream.
function svidStream(): { messages: AsyncIterable<SvidMessage>, push: (m: SvidMessage) => void, end: () => void } {
  const queue: SvidMessage[] = []
  let waiting: ((r: IteratorResult<SvidMessage>) => void) | undefined
  let ended = false
  const settle = (r: IteratorResult<SvidMessage>): boolean => {
    if (!waiting) return false
    const resolve = waiting
    waiting = undefined
    resolve(r)
    return true
  }
  return {
    messages: {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift() as SvidMessage, done: false })
          if (ended) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve) => { waiting = resolve })
        },
        return: () => {
          ended = true
          return Promise.resolve({ value: undefined, done: true })
        },
      }),
    },
    push: (m) => { if (!settle({ value: m, done: false })) queue.push(m) },
    end: () => {
      ended = true
      settle({ value: undefined, done: true })
    },
  }
}

// The Workload API's message shape: DER leaf, DER PKCS#8 key, DER bundle,
// so the push goes through the production `svidToCredentials` conversion.
function toSvidMessage(leaf: GeneratedCert, ca: GeneratedCa): SvidMessage {
  return {
    svids: [{
      x509Svid: new X509Certificate(leaf.certPem).raw,
      x509SvidKey: createPrivateKey(leaf.keyPem).export({ format: 'der', type: 'pkcs8' }),
      bundle: new X509Certificate(ca.certPem).raw,
    }],
  }
}

function serialOf(cert: GeneratedCert): string {
  return new X509Certificate(cert.certPem).serialNumber
}

// A client that validates tower's certificate against the trust bundle.
// Tower's SVID carries only a SPIFFE URI SAN, which Node's hostname check
// does not read, so the identity check compares the SPIFFE ID instead.
const clientTrust = (caPem: string) => ({
  ca: caPem,
  rejectUnauthorized: true,
  checkServerIdentity: (_host: string, cert: tls.PeerCertificate) =>
    cert.subjectaltname?.includes(`URI:${TOWER_ID}`) ? undefined : new Error(`server certificate is not ${TOWER_ID}`),
})

type Handshake = { ok: true, serial: string } | { ok: false, code: string }

async function handshake(port: number, caPem: string): Promise<Handshake> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: '127.0.0.1', port, ...clientTrust(caPem) }, () => {
      const serial = socket.getPeerCertificate().serialNumber
      socket.end()
      resolve({ ok: true, serial })
    })
    socket.on('error', (err: NodeJS.ErrnoException) => resolve({ ok: false, code: err.code ?? err.message }))
  })
}

// Polls new handshakes until one presents `serial`, bounded by `timeoutMs`.
async function waitForServedSerial(port: number, caPem: string, serial: string, timeoutMs = 5_000): Promise<Handshake> {
  const deadline = Date.now() + timeoutMs
  let last: Handshake = await handshake(port, caPem)
  while (!(last.ok && last.serial === serial) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    last = await handshake(port, caPem)
  }
  return last
}

async function requestEnrich(port: number, caPem: string, clientCert: GeneratedCert): Promise<{ statusCode: number, body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/enrich',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cert: clientCert.certPem,
        key: clientCert.keyPem,
        ...clientTrust(caPem),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          resolve({ statusCode: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined })
        })
      },
    )
    req.on('error', reject)
    req.end(JSON.stringify({ tenant: 'acme', idp: 'dex', identityHash: 'nonexistent', application: '_admin' }))
  })
}

describe('SPIFFE SVID rotation (I-0002) -- real TLS handshakes', () => {
  let app: FastifyInstance
  let port: number
  let ca: GeneratedCa
  let stream: ReturnType<typeof svidStream>
  let onStreamEnd: Mock<(err?: unknown) => void>
  let stop: () => void

  beforeEach(async () => {
    ca = await generateTestCa()
    // SVID A: the one fetched at boot, its TTL already past.
    const expired = await generateLeafCert(ca, 'tower.test', TOWER_ID, {
      notBefore: new Date(Date.now() - 4 * 3600_000),
      notAfter: new Date(Date.now() - 60_000),
    })

    const consequent = await buildInMemoryConsequent()
    app = await buildApp({
      consequent,
      tls: { cert: expired.certPem, key: expired.keyPem, ca: ca.certPem },
      spiffeTrustDomain: TRUST_DOMAIN,
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    port = typeof address === 'object' && address ? address.port : 0

    stream = svidStream()
    onStreamEnd = vi.fn<(err?: unknown) => void>()
    stop = watchSVIDRotation(app.server as unknown as SecureContextTarget, { messages: stream.messages, onStreamEnd })
  }, 30_000)

  afterEach(async () => {
    stop()
    await app.close()
  })

  it('serves the SVID SPIRE pushes on new handshakes, so an expired boot SVID stops failing mTLS', async () => {
    // The failure I-0002 reports: a client that validates tower's
    // certificate refuses the handshake once the boot SVID has expired.
    expect(await handshake(port, ca.certPem)).toEqual({ ok: false, code: 'CERT_HAS_EXPIRED' })

    // SVID B: SPIRE's successor, pushed on the FetchX509SVID stream.
    const successor = await generateLeafCert(ca, 'tower.test', TOWER_ID)
    stream.push(toSvidMessage(successor, ca))

    expect(await waitForServedSerial(port, ca.certPem, serialOf(successor))).toEqual({ ok: true, serial: serialOf(successor) })

    // And a portcullis call over the rotated certificate clears the mTLS
    // gate: the 403 comes from enrich's own deny (no such identity), not
    // from `requireSpiffePeer`, as in `spiffe-mtls.spec.ts`.
    const portcullis = await generateLeafCert(ca, 'portcullis.test', `spiffe://${TRUST_DOMAIN}/portcullis`)
    const response = await requestEnrich(port, ca.certPem, portcullis)
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'Forbidden' })
    expect(onStreamEnd).not.toHaveBeenCalled()
  }, 30_000)

  it('calls the stream-end handler, with no error, when the Workload API stream ends', async () => {
    stream.end()
    await vi.waitFor(() => expect(onStreamEnd).toHaveBeenCalledTimes(1))
    expect(onStreamEnd).toHaveBeenCalledWith()
  })

  it('does not call the stream-end handler once the watch is stopped', async () => {
    stop()
    stream.end()
    // Let the watch's loop observe both before asserting.
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
    expect(onStreamEnd).not.toHaveBeenCalled()
  })
})
