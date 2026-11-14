import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { createTowerFetch, towerFetchFor, watchTowerTrust, type TowerTrust } from '../../src/lib/server/tower-tls.js'
import { generateLeafCert, generateTestCa, type GeneratedCa, type GeneratedCert } from '../helpers/spiffe-test-certs.js'

// I-0001, ADR 0113: tower serves its SPIRE SVID, whose only SAN is a
// spiffe:// URI. These specs run real TLS handshakes against a server holding
// a certificate of that shape, so they prove what NODE_TLS_REJECT_UNAUTHORIZED=0
// used to hide: plain fetch refuses tower, and the trust-bundle fetch accepts
// it while still refusing a wrong CA, a wrong trust domain, and a cert that
// is no SPIFFE identity.

const TRUST_DOMAIN = 'authstar.test'
const TOWER_ID = `spiffe://${TRUST_DOMAIN}/ns/authstar/sa/tower`

interface TestServer {
  server: Server
  baseUrl: string
}

async function startServer(cert: GeneratedCert): Promise<TestServer> {
  const server = createServer({ cert: cert.certPem, key: cert.keyPem }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      if (req.url === '/empty') {
        res.writeHead(204).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'x-tower': 'yes' })
      res.end(
        JSON.stringify({
          method: req.method,
          path: req.url,
          authorization: req.headers.authorization ?? null,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, baseUrl: `https://localhost:${port}` }
}

async function stop(target: TestServer): Promise<void> {
  target.server.closeAllConnections()
  await new Promise<void>((resolve) => target.server.close(() => resolve()))
}

describe('tower-tls (I-0001, ADR 0113)', () => {
  let ca: GeneratedCa
  let otherCa: GeneratedCa
  let tower: TestServer
  let otherDomain: TestServer
  let notSpiffe: TestServer
  let trust: TowerTrust

  beforeAll(async () => {
    ca = await generateTestCa()
    otherCa = await generateTestCa()
    tower = await startServer(await generateLeafCert(ca, 'tower', TOWER_ID))
    otherDomain = await startServer(await generateLeafCert(ca, 'tower', 'spiffe://elsewhere.test/ns/authstar/sa/tower'))
    notSpiffe = await startServer(await generateLeafCert(ca, 'localhost', undefined, ['localhost']))
    trust = { caPem: ca.certPem, trustDomain: TRUST_DOMAIN }
  })

  afterAll(async () => {
    await Promise.all([stop(tower), stop(otherDomain), stop(notSpiffe)])
  })

  it('plain fetch refuses tower-shaped SVIDs, the failure NODE_TLS_REJECT_UNAUTHORIZED=0 hid', async () => {
    await expect(fetch(`${tower.baseUrl}/tenants/acme`)).rejects.toThrow()
  })

  it('reaches tower through the trust bundle and its trust domain, with method, headers, and body', async () => {
    const towerFetch = createTowerFetch(() => trust)
    const response = await towerFetch(`${tower.baseUrl}/tenants`, {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'acme' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-tower')).toBe('yes')
    expect(await response.json()).toEqual({
      method: 'POST',
      path: '/tenants',
      authorization: 'Bearer t',
      body: '{"slug":"acme"}',
    })
  })

  it('takes a Request, as SvelteKit handleFetch passes one', async () => {
    const towerFetch = createTowerFetch(() => trust)
    const response = await towerFetch(new Request(`${tower.baseUrl}/tenants/acme`))
    expect(await response.json()).toMatchObject({ method: 'GET', path: '/tenants/acme' })
  })

  it('answers a bodiless response for 204', async () => {
    const response = await createTowerFetch(() => trust)(`${tower.baseUrl}/empty`)
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })

  it('refuses tower when its chain does not verify against the trust bundle', async () => {
    const towerFetch = createTowerFetch(() => ({ caPem: otherCa.certPem, trustDomain: TRUST_DOMAIN }))
    await expect(towerFetch(`${tower.baseUrl}/tenants/acme`)).rejects.toThrow()
  })

  it('refuses a SPIFFE ID outside the trust domain', async () => {
    await expect(createTowerFetch(() => trust)(`${otherDomain.baseUrl}/tenants/acme`)).rejects.toThrow(
      /outside trust domain authstar\.test/,
    )
  })

  it('refuses a CA-signed certificate that carries no SPIFFE ID, even when its DNS name matches', async () => {
    await expect(createTowerFetch(() => trust)(`${notSpiffe.baseUrl}/tenants/acme`)).rejects.toThrow(/carries no SPIFFE ID/)
  })

  it('refuses an http:// URL', async () => {
    await expect(createTowerFetch(() => trust)('http://localhost:1/tenants')).rejects.toThrow(/https only/)
  })
})

function svidMessage(caPem: string, spiffeId: string) {
  const der = Buffer.from(caPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
  return { svids: [{ spiffeId, x509Svid: new Uint8Array(), x509SvidKey: new Uint8Array(), bundle: new Uint8Array(der), hint: '' }], crl: [], federatedBundles: {} }
}

function fakeWorkloadApi(messages: ReturnType<typeof svidMessage>[], hold: Promise<void>) {
  return {
    fetchX509SVID: () => ({
      responses: (async function* () {
        for (const message of messages) yield message
        await hold
      })(),
    }),
  } as unknown as NonNullable<Parameters<typeof watchTowerTrust>[0]>['client']
}

describe('watchTowerTrust', () => {
  it('answers the first push and follows later ones, then reports the stream ending', async () => {
    const first = await generateTestCa()
    const second = await generateTestCa()
    let release!: () => void
    const hold = new Promise<void>((resolve) => (release = resolve))
    const onStreamEnd = vi.fn()
    const current = await watchTowerTrust({
      client: fakeWorkloadApi([svidMessage(first.certPem, TOWER_ID), svidMessage(second.certPem, 'spiffe://rotated.test/ns/authstar/sa/keep')], hold),
      onStreamEnd,
    })
    await vi.waitFor(() => expect(current().trustDomain).toBe('rotated.test'))
    expect(current().caPem).toContain('BEGIN CERTIFICATE')
    expect(onStreamEnd).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(onStreamEnd).toHaveBeenCalledOnce())
  })

  it('fails when the stream closes before any SVID', async () => {
    await expect(watchTowerTrust({ client: fakeWorkloadApi([], Promise.resolve()), onStreamEnd: vi.fn() })).rejects.toThrow(
      /before it sent an SVID/,
    )
  })
})

describe('towerFetchFor', () => {
  it('answers plain fetch for an http:// tower URL without the Workload API', async () => {
    const towerFetch = await towerFetchFor('http://tower.authstar.svc.cluster.local:8080')
    expect(typeof towerFetch).toBe('function')
  })

  it('refuses an https:// tower URL when SPIFFE_ENDPOINT_SOCKET is unset, naming it', async () => {
    vi.stubEnv('SPIFFE_ENDPOINT_SOCKET', '')
    try {
      await expect(towerFetchFor('https://tower.authstar.svc.cluster.local:8080')).rejects.toThrow(/SPIFFE_ENDPOINT_SOCKET/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
