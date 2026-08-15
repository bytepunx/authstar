import { webcrypto } from 'node:crypto'
import * as x509 from '@peculiar/x509'

// Real X.509 cert generation (via `@peculiar/x509`, the same library the
// `spiffe` npm package itself uses for parsing) for `spiffe-mtls.spec.ts`'s
// own end-to-end proof -- a real TLS handshake over a real socket, not
// `app.inject()` (which never touches a real socket, so `getPeerCertificate`/
// `authorized` would never be exercised at all). Builds a real CA plus
// leaf certificates carrying a `spiffe://...` URI SAN, the same shape
// `parseCertificateBundle`/`parseCertificate` in `src/lib/spiffe-mtls.ts`
// consume on the production path.

const crypto = webcrypto as unknown as Crypto

export interface GeneratedCert {
  certPem: string
  keyPem: string
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>
}

async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey('pkcs8', key)
  const base64 = Buffer.from(der).toString('base64')
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

export interface GeneratedCa {
  cert: x509.X509Certificate
  certPem: string
  keys: CryptoKeyPair
}

export async function generateTestCa(): Promise<GeneratedCa> {
  const keys = await generateKeyPair()
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: 'CN=test-ca',
    keys,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 3600_000),
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
    ],
  }, crypto)
  return { cert, certPem: cert.toString('pem'), keys }
}

// `spiffeId` set to `undefined` produces a cert with no SPIFFE URI SAN at
// all -- useful for proving `requireSpiffePeer` rejects a validly-CA-signed
// cert that simply isn't a SPIFFE identity, not just an absent cert.
export async function generateLeafCert(ca: GeneratedCa, commonName: string, spiffeId: string | undefined): Promise<GeneratedCert> {
  const keys = await generateKeyPair()
  const extensions: x509.Extension[] = [
    new x509.BasicConstraintsExtension(false),
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
    new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2'], true), // serverAuth + clientAuth
  ]
  if (spiffeId) {
    extensions.push(new x509.SubjectAlternativeNameExtension([{ type: 'url', value: spiffeId }]))
  }

  const cert = await x509.X509CertificateGenerator.create({
    subject: `CN=${commonName}`,
    issuer: ca.cert.subject,
    publicKey: keys.publicKey,
    signingKey: ca.keys.privateKey,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 3600_000),
    extensions,
  }, crypto)

  return { certPem: cert.toString('pem'), keyPem: await exportPrivateKeyPem(keys.privateKey) }
}
