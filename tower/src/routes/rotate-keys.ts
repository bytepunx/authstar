import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { jsonPatchAppend } from '@bytepunx/signet-client'
import { randomEcPrivateKeyPem, randomSecret } from '../lib/tenant-keys.js'

// `POST /operator/tenants/{tenantSlug}/rotate-keys` -- ADR 0080/0088,
// design/stories/tower/011-tenant-management-and-key-rotation.md.
//
// Operator-only, cross-tenant -- no tenant-scoped equivalent (ADR 0080's own
// framing: this is an operator/infrastructure concern, not a tenant-admin
// action, even though it acts on one tenant's keys). Reuses the same
// shared-token check `provisioning.ts`'s operator path already established
// (this pilot slice's auth model, see that file's own header comment) rather
// than inventing a second one.
//
// Each requested key type is generated and pushed independently -- a
// failure partway through (e.g. session succeeds, internal's signet push
// times out) is reported per-key, not rolled back; there is nothing to roll
// back to, since each key type's push is already its own independent signet
// write with no cross-key transaction.
//
// Versioning: each new generation's `version` is a Unix-seconds timestamp,
// not a read-then-increment counter. This is deliberate, not a shortcut --
// tower has no signet policy grant to *read* portcullis's current config
// (only to push/patch it, ADR 0011's elevated GitOps access), and computing
// "current max + 1" would require reading the existing generations array
// first (see bytepunx/authstar-tower#1, bytepunx/signet#38). A timestamp is
// simpler and needs no read at all: it's guaranteed higher than any
// previously-issued version (clock strictly advances), and `EcKeyGenerations`/
// `IdentityHashKeys` on the portcullis side only ever compare versions by
// ordering, never by exact value, so an arbitrary large integer works
// identically to a small sequential one.
//
// Pruning generations past their retention window is NOT done here -- ADR
// 0080 describes pruning "at rotation time," but doing that safely requires
// knowing the current array's exact contents (to remove the right entries by
// index), which hits the same missing-read-access gap version numbering
// sidesteps. Deferred as a known, documented gap rather than implemented
// unsafely; generations simply accumulate until pruning is designed
// (tracked alongside the read-access question).

const rotateKeysParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const rotateKeysBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['keys'],
  properties: {
    keys: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: ['session', 'internal', 'identity-hash'] },
      uniqueItems: true,
    },
  },
} as const

type RotatableKey = 'session' | 'internal' | 'identity-hash'
interface RotateKeysBody {
  keys: RotatableKey[]
}

interface RotationResult {
  key: RotatableKey
  version: number
  effectiveFrom: string
}

interface RotationFailure {
  key: RotatableKey
  error: string
}

function isOperator(request: { headers: Record<string, unknown> }, operatorToken: string): boolean {
  return Boolean(operatorToken) && request.headers['x-operator-token'] === operatorToken
}

async function rotateOne(app: FastifyInstance, tenantSlug: string, key: RotatableKey): Promise<RotationResult> {
  const version = Math.floor(Date.now() / 1000)
  const effectiveFrom = new Date(version * 1000).toISOString()

  switch (key) {
    case 'session':
      await app.signetAdmin.pushSecret('portcullis', `tenant-${tenantSlug}-session-key-${version}`, randomEcPrivateKeyPem())
      await app.signetAdmin.patchConfig('portcullis', [
        jsonPatchAppend(`/tenants/${tenantSlug}/sessionKeyGenerations`, { version, effectiveFrom }),
      ])
      break
    case 'internal':
      await app.signetAdmin.pushSecret('portcullis', `tenant-${tenantSlug}-internal-key-${version}`, randomEcPrivateKeyPem())
      await app.signetAdmin.patchConfig('portcullis', [
        jsonPatchAppend(`/tenants/${tenantSlug}/internalKeyGenerations`, { version, effectiveFrom }),
      ])
      break
    case 'identity-hash':
      await app.signetAdmin.pushSecret('portcullis', `tenant-${tenantSlug}-identity-hash-key-${version}`, randomSecret())
      await app.signetAdmin.patchConfig('portcullis', [
        jsonPatchAppend(`/tenants/${tenantSlug}/identityHashKeyGenerations`, { version, effectiveFrom }),
      ])
      break
  }

  return { key, version, effectiveFrom }
}

const rotateKeysRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/operator/tenants/:tenantSlug/rotate-keys',
    { schema: { params: rotateKeysParamsSchema, body: rotateKeysBodySchema } },
    async (request, reply) => {
      if (!isOperator(request, app.provisioningConfig.operatorToken)) {
        return reply.code(403).send({ error: 'operator bearer token required' })
      }

      const { tenantSlug } = request.params as { tenantSlug: string }
      const { keys } = request.body as RotateKeysBody

      const rotated: RotationResult[] = []
      const failed: RotationFailure[] = []
      for (const key of keys) {
        try {
          rotated.push(await rotateOne(app, tenantSlug, key))
        } catch (err) {
          failed.push({ key, error: err instanceof Error ? err.message : String(err) })
        }
      }

      const status = failed.length === 0 ? 200 : rotated.length === 0 ? 502 : 207
      return reply.code(status).send({ rotated, failed })
    },
  )
}

export default rotateKeysRoutes
