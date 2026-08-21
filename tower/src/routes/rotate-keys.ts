import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { jsonPatchAppend, jsonPatchRemove, jsonPatchTest } from '@bytepunx/signet-client'
import { randomEcPrivateKeyPem, randomSecret } from '../lib/tenant-keys.js'
import { isOperatorRequest } from '../lib/operator-auth.js'

// `POST /operator/tenants/{tenantSlug}/rotate-keys` -- ADR 0080/0088,
// design/stories/tower/011-tenant-management-and-key-rotation.md.
//
// Operator-only, cross-tenant -- no tenant-scoped equivalent (ADR 0080's own
// framing: this is an operator/infrastructure concern, not a tenant-admin
// action, even though it acts on one tenant's keys). Uses the same
// `Authorization: Bearer` operator-token check every operator route uses
// (`isOperatorRequest`, ADR 0021/0045) -- steward's client sends this for
// every operator call (`steward/src/lib/server/backend-client.ts`); an
// earlier version of this route checked a bespoke `x-operator-token` header
// steward never sends, which meant this route 403'd on every real call.
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
// Pruning generations past their retention window, at rotation time, per
// ADR 0080 -- this needed a way to read the current array's exact contents
// first (to remove stale entries by index without guessing), which is what
// signet's GitOpsService.GetServiceConfig RPC (bytepunx/signet#38,
// bytepunx/authstar-tower#2) exists for; see `signetAdmin.getConfig`'s own
// doc comment.

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

interface KeyGeneration {
  version: number
  effectiveFrom: string
}

const GENERATIONS_FIELD: Record<RotatableKey, string> = {
  session: 'sessionKeyGenerations',
  internal: 'internalKeyGenerations',
  'identity-hash': 'identityHashKeyGenerations',
}

// Internal keys have no cookie -- ADR 0088's fixed 300s buffer (60s token TTL
// plus clock skew), not a config-derived value. Session/identity-hash
// retention instead follows the tenant's own cookie.maxAge (ADR 0080),
// falling back to the 604800s (7-day) default portcullis itself uses when a
// tenant hasn't set one explicitly.
const INTERNAL_KEY_RETENTION_SECONDS = 300
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 604_800

function retentionSecondsFor(key: RotatableKey, tenant: Record<string, unknown> | undefined): number {
  if (key === 'internal') return INTERNAL_KEY_RETENTION_SECONDS
  const maxAge = (tenant?.cookie as { maxAge?: number } | undefined)?.maxAge
  return typeof maxAge === 'number' ? maxAge : DEFAULT_COOKIE_MAX_AGE_SECONDS
}

// Removes generations past their retention window -- never the current
// (highest-version) generation, regardless of age, since that's the one
// actively signing/verifying. Each removal is paired with a `test` (RFC
// 6902 section 4.6) against the exact snapshot `getConfig` just read: if
// the live document has since diverged (a concurrent rotation elsewhere
// changed this same array), the whole patch fails atomically instead of
// removing the wrong index -- safer than silently corrupting the array,
// and the next rotation's prune pass will simply retry against a fresh
// read. Removed in descending index order so earlier indices stay valid
// as later ones are spliced out.
async function pruneStaleGenerations(app: FastifyInstance, tenantSlug: string, key: RotatableKey, currentVersion: number): Promise<void> {
  const config = await app.signetAdmin.getConfig('portcullis')
  if (!config) return // domain-pending tenant (ADR 0093) -- nothing provisioned to prune yet

  const content = config.content as { tenants?: Record<string, Record<string, unknown>> }
  const tenant = content.tenants?.[tenantSlug]
  const field = GENERATIONS_FIELD[key]
  const generations = (tenant?.[field] as KeyGeneration[] | undefined) ?? []
  if (generations.length === 0) return

  const currentMaxVersion = Math.max(currentVersion, ...generations.map((generation) => generation.version))
  const cutoff = currentVersion - retentionSecondsFor(key, tenant)
  const stale = generations
    .map((generation, index) => ({ generation, index }))
    .filter(({ generation }) => generation.version !== currentMaxVersion && generation.version < cutoff)
    .sort((a, b) => b.index - a.index)

  if (stale.length === 0) return

  const path = `/tenants/${tenantSlug}/${field}`
  await app.signetAdmin.patchConfig(
    'portcullis',
    stale.flatMap(({ generation, index }) => [
      jsonPatchTest(`${path}/${index}`, generation),
      jsonPatchRemove(`${path}/${index}`),
    ]),
  )
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

  // Pruning is a follow-up cleanup step on an already-succeeded rotation --
  // the new key is live either way, so a prune failure (e.g. a concurrent
  // rotation's `test` guard tripping) is logged and swallowed rather than
  // reported as a rotation failure; the next rotation's prune pass will
  // simply retry against a fresh read.
  try {
    await pruneStaleGenerations(app, tenantSlug, key, version)
  } catch (err) {
    app.log.error({ err, tenantSlug, key }, 'pruning past-retention key generations failed')
  }

  return { key, version, effectiveFrom }
}

const rotateKeysRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/operator/tenants/:tenantSlug/rotate-keys',
    { schema: { params: rotateKeysParamsSchema, body: rotateKeysBodySchema } },
    async (request, reply) => {
      if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
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
