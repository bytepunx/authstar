import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { UsageRecordState } from '../actors/usage_record_actor.js'
import type { UsageReportingCredentialState } from '../actors/usage_reporting_credential_actor.js'
import type { PlanMappingState } from '../actors/plan_mapping_actor.js'
import generateId from '../lib/ids.js'
import { generateSecret, hashSecret } from '../lib/hash.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/keep/005-usage-records-and-credentials.md.
//
// `POST /_authstar/usage-reports` (the batched, credential-authenticated
// ingress ADR 0079 describes) is deliberately not implemented in this pilot
// slice -- it needs portcullis's own `Host`-resolved application context to
// cross-check against, which doesn't exist without a running portcullis.
// `POST /tenants/{tenantSlug}/usage-records` (the shared handler both
// ingress paths ultimately call) is implemented and tested directly here.
// See TESTING.md.
//
// Permission gates (Story 007): deliberately **not** applied to `POST
// .../usage-records` -- Story 005 is explicit that this route has "two
// distinct callers, two distinct auth mechanisms" (portcullis's
// synchronous, internal-JWT-*derived-context* path, and keep's own
// credential-verified batched path), neither of which carries a
// tenant-admin's `permissions` grants at all; `requirePermission` doesn't
// apply here, not merely omitted. The two admin-facing `GET` reads use
// `billing:manage` per Story 007's table. Usage-credential issue/list/
// revoke use `applications:manage`, **not** `billing:manage` despite Story
// 007's own table row grouping them together -- Story 005's own text is
// explicit and reasoned ("not a billing permission, since this is squarely
// application-level operational config, the same category as hosts/
// upstream/CORS on the tower side," ADR 0079) and takes precedence here as
// the more specific, more detailed source; Story 007's table has a bug on
// this one row, flagged rather than silently propagated.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const idParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'id'],
  properties: { tenantSlug: { type: 'string' }, id: { type: 'string' } },
} as const

const appParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'appSlug'],
  properties: { tenantSlug: { type: 'string' }, appSlug: { type: 'string' } },
} as const

const credentialParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'appSlug', 'credentialId'],
  properties: { tenantSlug: { type: 'string' }, appSlug: { type: 'string' }, credentialId: { type: 'string' } },
} as const

const recordBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['application', 'accountId', 'meter', 'quantity', 'idempotencyKey'],
  properties: {
    application: { type: 'string', minLength: 1 },
    accountId: { type: 'string', minLength: 1 },
    meter: { type: 'string', minLength: 1 },
    quantity: { type: 'number' },
    idempotencyKey: { type: 'string', minLength: 1 },
  },
} as const

function usageKey(tenantSlug: string, idempotencyKey: string): string {
  return `${tenantSlug}:${idempotencyKey}`
}

async function findMeteredMapping(app: FastifyInstance, tenant: string, meter: string): Promise<PlanMappingState | undefined> {
  const instances = await app.consequent.find('planMapping', searchCriteria({ tenant, meter }))
  return instances.map((i) => i.state as unknown as PlanMappingState).find((m) => m.status === 'active')
}

const usageRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/usage-records', { schema: { params: tenantParamsSchema, body: recordBodySchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as { application: string, accountId: string, meter: string, quantity: number, idempotencyKey: string }

    // Rejects unrecognized `meter` values -- validated against the
    // tenant's own metered planMapping entries (Story 001/003/005).
    const mapping = await findMeteredMapping(app, tenantSlug, body.meter)
    if (!mapping) {
      return reply.code(400).send({ error: `unrecognized meter '${body.meter}' for this tenant` })
    }

    const key = usageKey(tenantSlug, body.idempotencyKey)

    // A redelivered or app-retried report with the same key is a no-op,
    // not a double-charge (Story 005) -- checked here, before calling
    // `handle`, rather than as an actor-level guard, since the correct
    // response to a duplicate is "return the existing record successfully."
    const existingInstance = await app.consequent.fetch('usageRecord', key)
    const existing = existingInstance!.state as unknown as UsageRecordState
    if (existing.createdAt) {
      return reply.code(200).send(toResponse(existing))
    }

    await app.consequent.handle(key, 'usageRecord.create', {
      key,
      tenant: tenantSlug,
      application: body.application,
      accountId: body.accountId,
      meter: body.meter,
      quantity: body.quantity,
      idempotencyKey: body.idempotencyKey,
    })

    // Current-value-replace, filtered to the resolved application (Story
    // 001) -- this pilot's running total is the sum of every usageRecord
    // for this tenant/application/meter (a real deployment would likely
    // maintain a running materialized total rather than re-summing on
    // every write; left as a follow-up, TESTING.md).
    const allForMeter = await app.consequent.find('usageRecord', searchCriteria({ tenant: tenantSlug, application: body.application, meter: body.meter }))
    const periodUsage = allForMeter.reduce((sum, i) => sum + ((i.state as unknown as UsageRecordState).quantity ?? 0), 0)

    const sequence = app.sequences.next(tenantSlug, { tenant: tenantSlug })
    await app.entitlements.publish({
      type: 'entitlement.usage-updated',
      tenant: tenantSlug,
      scope: { tenant: tenantSlug },
      application: body.application,
      meter: body.meter,
      periodUsage,
      periodLimit: null,
      sequence,
    })

    const created = await app.consequent.fetch('usageRecord', key)
    const state = created!.state as unknown as UsageRecordState
    return reply.code(201).send({ ...toResponse(state), periodUsage })
  })

  app.get('/tenants/:tenantSlug/usage-records', { schema: { params: tenantParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { meter, application } = request.query as { meter?: string, application?: string }
    const filters: Record<string, unknown> = { tenant: tenantSlug }
    if (meter) filters.meter = meter
    if (application) filters.application = application
    const instances = await app.consequent.find('usageRecord', searchCriteria(filters))
    return instances.map((i) => i.state as unknown as UsageRecordState).filter((r) => r.createdAt).map(toResponse)
  })

  app.get('/tenants/:tenantSlug/usage-records/:id', { schema: { params: idParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const key = id.includes(':') ? id : usageKey(tenantSlug, id)
    const instance = await app.consequent.fetch('usageRecord', key)
    const state = instance!.state as unknown as UsageRecordState
    if (!state.createdAt || state.tenant !== tenantSlug) return reply.code(404).send()
    return toResponse(state)
  })

  app.post('/tenants/:tenantSlug/applications/:appSlug/usage-credentials', { schema: { params: appParamsSchema }, preHandler: requirePermission('applications:manage') }, async (request, reply) => {
    const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
    const secret = generateSecret()
    const credentialId = generateId()
    await app.consequent.handle(credentialId, 'usageReportingCredential.create', {
      credentialId,
      tenant: tenantSlug,
      application: appSlug,
      hashedSecret: hashSecret(secret),
    })
    // Returned once -- never retrievable again (Story 001/005).
    return reply.code(201).send({ credentialId, secret })
  })

  app.get('/tenants/:tenantSlug/applications/:appSlug/usage-credentials', { schema: { params: appParamsSchema }, preHandler: requirePermission('applications:manage') }, async (request) => {
    const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
    const instances = await app.consequent.find('usageReportingCredential', searchCriteria({ tenant: tenantSlug, application: appSlug }))
    return instances
      .map((i) => i.state as unknown as UsageReportingCredentialState)
      .filter((c) => c.createdAt)
      .map((c) => ({ credentialId: c.credentialId, status: c.status, createdAt: c.createdAt }))
  })

  app.delete('/tenants/:tenantSlug/applications/:appSlug/usage-credentials/:credentialId', { schema: { params: credentialParamsSchema }, preHandler: requirePermission('applications:manage') }, async (request, reply) => {
    const { tenantSlug, appSlug, credentialId } = request.params as { tenantSlug: string, appSlug: string, credentialId: string }
    const instance = await app.consequent.fetch('usageReportingCredential', credentialId)
    const state = instance!.state as unknown as UsageReportingCredentialState
    if (!state.createdAt || state.tenant !== tenantSlug || state.application !== appSlug) {
      return reply.code(404).send()
    }
    const results = await app.consequent.handle(credentialId, 'usageReportingCredential.revoke', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
    return reply.code(204).send()
  })
}

function toResponse(state: UsageRecordState) {
  return { ...state }
}

export default usageRoutes
