import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import https from 'node:https'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { generateTestCa, generateLeafCert, type GeneratedCa } from '../lib/spiffe-test-certs.js'

// Behavior tier, but a genuine end-to-end proof rather than the usual
// `app.inject()` contract test: `app.inject()` never touches a real
// socket, so `getPeerCertificate()`/`socket.authorized` -- the exact
// mechanism `requireSpiffePeer` (`src/lib/spiffe-mtls.ts`) depends on --
// would never actually be exercised. This spins up a real
// `https.Server` (via `buildApp`'s own `tls` option) and makes real
// `https.request()` calls with different client certificates, generated
// for real via `@peculiar/x509` (the same library the `spiffe` npm
// package itself uses to parse certs on the production path).

const TRUST_DOMAIN = 'test.trust.domain'

async function requestEnrich(port: number, clientCert?: { certPem: string, keyPem: string }, ca?: string): Promise<{ statusCode: number, body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/enrich',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ca,
        cert: clientCert?.certPem,
        key: clientCert?.keyPem,
        rejectUnauthorized: false, // this is the *client* validating tower's own server cert -- irrelevant to what's under test
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

describe('SPIFFE mTLS -- /enrich (real TLS handshake, not app.inject())', () => {
  let app: FastifyInstance
  let port: number
  let ca: GeneratedCa
  let caPem: string

  beforeAll(async () => {
    ca = await generateTestCa()
    caPem = ca.certPem
    const server = await generateLeafCert(ca, 'tower.test', undefined)

    const consequent = await buildInMemoryConsequent()
    app = await buildApp({
      consequent,
      tls: { cert: server.certPem, key: server.keyPem, ca: caPem },
      spiffeTrustDomain: TRUST_DOMAIN,
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    port = typeof address === 'object' && address ? address.port : 0
  }, 30_000)

  afterAll(async () => {
    await app.close()
  })

  it('rejects a request with no client certificate at all', async () => {
    const response = await requestEnrich(port, undefined, caPem)
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'a validated SPIFFE client certificate is required' })
  })

  it('rejects a validly-CA-signed client certificate with no SPIFFE URI SAN', async () => {
    const noSpiffeId = await generateLeafCert(ca, 'not-spiffe.test', undefined)
    const response = await requestEnrich(port, noSpiffeId, caPem)
    expect(response.statusCode).toBe(403)
    // Chain-trusted (`socket.authorized === true`), so this clears the
    // first check -- it fails at SPIFFE-ID extraction instead, the same
    // branch a wrong-trust-domain cert hits.
    expect(response.body).toEqual({ error: 'client certificate is not a valid SPIFFE ID for this trust domain' })
  })

  it('rejects a valid SPIFFE certificate from the wrong trust domain', async () => {
    const wrongDomain = await generateLeafCert(ca, 'portcullis.test', 'spiffe://other.trust.domain/portcullis')
    const response = await requestEnrich(port, wrongDomain, caPem)
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'client certificate is not a valid SPIFFE ID for this trust domain' })
  })

  it('rejects a client certificate signed by an untrusted CA (never chains to the configured ca, so Node marks it unauthorized)', async () => {
    const otherCa = await generateTestCa()
    const untrusted = await generateLeafCert(otherCa, 'portcullis.test', `spiffe://${TRUST_DOMAIN}/portcullis`)
    const response = await requestEnrich(port, untrusted, caPem)
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'a validated SPIFFE client certificate is required' })
  })

  it('accepts a valid SPIFFE certificate in the right trust domain -- reaches the real handler (denied for an unrelated reason: no such identity)', async () => {
    const portcullis = await generateLeafCert(ca, 'portcullis.test', `spiffe://${TRUST_DOMAIN}/portcullis`)
    const response = await requestEnrich(port, portcullis, caPem)
    // 403 here too -- but from enrich.ts's own deny() (no identity record
    // matches 'nonexistent'), not requireSpiffePeer -- proven by the
    // different error body, confirming the mTLS check passed and control
    // reached the real route handler.
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'Forbidden' })
  })
})

describe('SPIFFE mTLS -- disabled by default (every existing test/dev caller)', () => {
  it('leaves /enrich reachable with no client certificate at all when tls/spiffeTrustDomain are omitted', async () => {
    const consequent = await buildInMemoryConsequent()
    const app = await buildApp({ consequent })
    const response = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme', idp: 'dex', identityHash: 'nonexistent', application: '_admin' },
    })
    // Denied for the ordinary reason (no such identity), not by a
    // SPIFFE check that doesn't exist for this app instance at all.
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'Forbidden' })
    await app.close()
  })
})
