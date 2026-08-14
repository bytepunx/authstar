import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { isOperatorRequest } from '../lib/operator-auth.js'
import type { PersistedPayloadKeyGeneration } from '../lib/payload-crypto.js'
import type { PersistedUnsubscribeKeyGeneration } from '../lib/unsubscribe-token.js'

// `POST /operator/rotate-keys` -- ADR 0081, resolving the gap named in ADR
// 0025/0054: herald's two installation-wide keys (payload-encryption,
// unsubscribe-signing) had no rotation *or* initial-distribution
// mechanism. This route is both -- the first-ever call (a deploy-time
// operator action) is what actually gets a real public key into tower's
// bundle in the first place; every later call is an ordinary rotation.
// No `tenantSlug` in the path -- neither key is tenant-scoped.
//
// Operator-only, cross-tenant -- same `Authorization: Bearer` shared
// operator-token check every operator route in this system uses
// (`isOperatorRequest`, ADR 0021/0045), extended to herald for the first
// time here (ADR 0081: "herald joins the shared operator-token
// distribution").
//
// Each requested key is rotated and persisted independently -- a failure
// partway through (e.g. payload-encryption succeeds, unsubscribe-signing's
// signet push times out) is reported per-key, not rolled back; there is
// nothing to roll back to, matching tower's own `rotate-keys.ts` posture.

const rotateKeysBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['keys'],
  properties: {
    keys: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: ['payload-encryption', 'unsubscribe-signing'] },
      uniqueItems: true,
    },
  },
} as const

type RotatableKey = 'payload-encryption' | 'unsubscribe-signing'
interface RotateKeysBody {
  keys: RotatableKey[]
}

interface RotationResult {
  key: RotatableKey
  version: number
}

interface RotationFailure {
  key: RotatableKey
  error: string
}

function pemOf(key: { export(options: { type: 'spki' | 'pkcs8', format: 'pem' }): string | Buffer }, type: 'spki' | 'pkcs8'): string {
  return key.export({ type, format: 'pem' }).toString()
}

async function rotatePayloadEncryption(app: FastifyInstance): Promise<RotationResult> {
  const generation = app.payloadKeyring.rotate()

  // Persist the *full* generation set to herald's own bundle -- not just
  // the newest one -- so a restart doesn't strand an already-encrypted
  // `communication` under a generation herald no longer holds (Story
  // 001/ADR 0081).
  const persisted: PersistedPayloadKeyGeneration[] = app.payloadKeyring.allGenerations().map((g) => ({
    version: g.version,
    publicKeyPem: pemOf(g.publicKey, 'spki'),
    privateKeyPem: pemOf(g.privateKey, 'pkcs8'),
  }))
  await app.signetAdmin.pushSecret('herald', 'payloadKeyGenerations', JSON.stringify(persisted))

  // Distribute only the *current* public key to every real publisher (ADR
  // 0025) -- a publisher only ever encrypts with the current version, so
  // it has no use for old generations, unlike herald's own decrypt-side
  // keyring above. Tower is the only confirmed real publisher of
  // `comms.transactional.*` today (checked directly against tower's own
  // src/, not assumed) -- keep and portcullis are named as future
  // publishers by ADR 0025 but neither publishes anything through this
  // path yet, so nothing to push there until one does.
  const publicKeyPem = pemOf(generation.publicKey, 'spki')
  await app.signetAdmin.pushSecret(
    'tower',
    'heraldPayloadPublicKey',
    JSON.stringify({ version: generation.version, publicKeyPem }),
  )

  return { key: 'payload-encryption', version: generation.version }
}

async function rotateUnsubscribeSigning(app: FastifyInstance): Promise<RotationResult> {
  const version = app.unsubscribeKeyring.rotate()

  // Every generation, never pruned automatically (ADR 0081: an unsubscribe
  // link's real lifetime has no reliable bound) -- persisted to herald's
  // own bundle only, no cross-service distribution (only herald itself
  // ever signs or verifies these).
  const persisted: PersistedUnsubscribeKeyGeneration[] = app.unsubscribeKeyring.allGenerations().map((g) => ({
    version: g.version,
    keyBase64: g.key.toString('base64'),
  }))
  await app.signetAdmin.pushSecret('herald', 'unsubscribeKeyGenerations', JSON.stringify(persisted))

  return { key: 'unsubscribe-signing', version }
}

const operatorRotateKeysRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/operator/rotate-keys', { schema: { body: rotateKeysBodySchema } }, async (request, reply) => {
    if (!isOperatorRequest(request.headers, app.operatorToken)) {
      return reply.code(403).send({ error: 'operator bearer token required' })
    }

    const { keys } = request.body as RotateKeysBody
    const rotated: RotationResult[] = []
    const failed: RotationFailure[] = []

    for (const key of keys) {
      try {
        rotated.push(key === 'payload-encryption' ? await rotatePayloadEncryption(app) : await rotateUnsubscribeSigning(app))
      } catch (err) {
        failed.push({ key, error: err instanceof Error ? err.message : String(err) })
      }
    }

    const status = failed.length === 0 ? 200 : rotated.length === 0 ? 502 : 207
    return reply.code(status).send({ rotated, failed })
  })
}

export default operatorRotateKeysRoutes
