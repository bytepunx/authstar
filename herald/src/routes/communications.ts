import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { CommunicationState } from '../actors/communication_actor.js'
import { decryptPayload, deserializeEnvelope } from '../lib/payload-crypto.js'
import { render } from '../lib/mustache-render.js'
import { resolvePinnedTemplate } from '../lib/template-lookup.js'
import { processCommunication } from '../lib/send-worker.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/herald/004-communication-history-opt-outs-and-suppressions.md
// and the manual-retry route from
// design/stories/herald/002-send-worker-and-retry.md.

async function fetchCommunication(app: FastifyInstance, tenantSlug: string, id: string): Promise<CommunicationState> {
  const instance = await app.consequent.fetch('communication', `${tenantSlug}:${id}`)
  return instance!.state as unknown as CommunicationState
}

function exists(state: CommunicationState): boolean {
  return Boolean(state.createdAt)
}

// Minimal audit fields only -- never `encryptedPayload`/`payloadKeyVersion`
// on list/detail responses, even though they're not plaintext (Story 004:
// "list responses don't leak ciphertext, even though it's not plaintext").
function toSummary(state: CommunicationState) {
  return {
    idempotencyKey: state.idempotencyKey,
    tenant: state.tenant,
    application: state.application,
    contactId: state.contactId,
    category: state.category,
    type: state.type,
    title: state.title,
    channel: state.channel,
    status: state.status,
    createdAt: state.createdAt,
    sentAt: state.sentAt,
    error: state.error,
    retryCount: state.retryCount,
    nextRetryAt: state.nextRetryAt,
    lastAttemptAt: state.lastAttemptAt,
    lastError: state.lastError,
    payloadPurgedAt: state.payloadPurgedAt,
    providerMessageId: state.providerMessageId,
    complainedAt: state.complainedAt,
  }
}

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

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contactId: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'sent', 'delivered', 'bounced', 'failed', 'suppressed'] },
    since: { type: 'string', format: 'date-time' },
    until: { type: 'string', format: 'date-time' },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    cursor: { type: 'string' },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    // "pending" is the only value ever accepted -- the manual-retry
    // mechanism (Story 002), no other status is client-settable through
    // this route.
    status: { type: 'string', enum: ['pending'] },
  },
} as const

const communicationRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/communications', { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requirePermission('communications:read') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const query = request.query as { contactId?: string, type?: string, status?: string, since?: string, until?: string, limit?: number, cursor?: string }

    // Criteria wrapped in an array -- see the fuller note in
    // `src/lib/template-lookup.ts#templatesFor` for why (`consequent-
    // postgres`'s real search adapter requires it despite the published
    // type).
    const instances = await app.consequent.find('communication', [{ tenant: tenantSlug }] as unknown as Record<string, unknown>)
    let states = instances.map((i) => i.state as unknown as CommunicationState)

    if (query.contactId) states = states.filter((s) => s.contactId === query.contactId)
    if (query.type) states = states.filter((s) => s.type === query.type)
    if (query.status) states = states.filter((s) => s.status === query.status)
    if (query.since) states = states.filter((s) => s.createdAt >= query.since!)
    if (query.until) states = states.filter((s) => s.createdAt <= query.until!)

    states.sort((a, b) => a.createdAt === b.createdAt ? a.idempotencyKey.localeCompare(b.idempotencyKey) : a.createdAt.localeCompare(b.createdAt))

    if (query.cursor) {
      const cursorIndex = states.findIndex((s) => s.idempotencyKey === query.cursor)
      states = cursorIndex >= 0 ? states.slice(cursorIndex + 1) : states
    }

    const limit = query.limit ?? 25
    const page = states.slice(0, limit)
    const nextCursor = states.length > limit ? page[page.length - 1]?.idempotencyKey ?? null : null

    return { items: page.map(toSummary), nextCursor }
  })

  app.get('/tenants/:tenantSlug/communications/:id', { schema: { params: idParamsSchema }, preHandler: requirePermission('communications:read') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const state = await fetchCommunication(app, tenantSlug, id)
    if (!exists(state)) {
      return reply.code(404).send()
    }
    return toSummary(state)
  })

  // On-demand decrypt + render (Story 004) -- real PII exposure, narrowly
  // permissioned in production. Reconstructs exactly what was actually
  // sent, using the template version pinned on the record, not the
  // current one. Gated by `communications:read` -- the only grant ADR
  // 0051's closed vocabulary defines for this resource family; there is
  // no separate, stricter "read the actual content" grant, despite the
  // real-PII-exposure sensitivity this route's own comment calls out.
  app.get('/tenants/:tenantSlug/communications/:id/render', { schema: { params: idParamsSchema }, preHandler: requirePermission('communications:read') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const state = await fetchCommunication(app, tenantSlug, id)
    if (!exists(state)) {
      return reply.code(404).send()
    }

    if (state.payloadPurgedAt) {
      return { ...toSummary(state), payloadAvailable: false, reason: 'payload purged per retention policy' }
    }

    const keyGeneration = app.payloadKeyring.get(state.payloadKeyVersion)
    if (!keyGeneration) {
      return reply.code(410).send({ ...toSummary(state), payloadAvailable: false, reason: `payload key generation ${state.payloadKeyVersion} no longer held` })
    }

    const template = await resolvePinnedTemplate(app.consequent, tenantSlug, state.type, state.templateVersion)
    if (!template) {
      return reply.code(410).send({ ...toSummary(state), payloadAvailable: false, reason: 'template version no longer available' })
    }

    const envelope = deserializeEnvelope(state.encryptedPayload)
    const decrypted = decryptPayload(keyGeneration.privateKey, envelope) as { to: string, templateData: Record<string, unknown> }

    return {
      ...toSummary(state),
      payloadAvailable: true,
      to: decrypted.to,
      subject: render(template.subjectTemplate, decrypted.templateData),
      body: render(template.bodyTemplate, decrypted.templateData),
    }
  })

  // Manual retry -- already fully specified in Story 002, listed here so
  // this story's route group is complete (Story 004). Runs through the
  // identical suppression/opt-out -> render -> dispatch sequence -- a
  // manually retried send to a since-suppressed contact still gets
  // suppressed, not force-sent. Gated by `communications:read` -- neither
  // Story 002 nor Story 006's own table names a distinct grant for this
  // write action, and ADR 0051's closed permission vocabulary has no
  // `communications:manage`; flagged here rather than inventing a new
  // grant this design doesn't otherwise define.
  app.patch('/tenants/:tenantSlug/communications/:id', { schema: { params: idParamsSchema, body: patchBodySchema }, preHandler: requirePermission('communications:read') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }

    const current = await fetchCommunication(app, tenantSlug, id)
    if (!exists(current)) {
      return reply.code(404).send()
    }

    const results = await app.consequent.handle(`${tenantSlug}:${id}`, 'communication.resetForRetry', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    await processCommunication(app.sendWorkerDeps, tenantSlug, id)

    const updated = await fetchCommunication(app, tenantSlug, id)
    return toSummary(updated)
  })
}

export default communicationRoutes
