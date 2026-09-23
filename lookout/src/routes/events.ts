import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { isClientEventType } from '../lib/event-types.js'

// Per design/stories/lookout/001-ingestion-contract.md. One endpoint, two
// callers (portcullis's server-side dispatch, and portcullis's forwarded
// client-event route) -- they hit the exact same URL and shape, differing
// only in which validations already ran upstream. Auth is SPIFFE mTLS only,
// enforced at the mesh/infra layer (kluster/signet's `spiffe-workload`
// bundle), not app code -- there's no bearer token or `permissions` claim
// to check here, closer in spirit to tower's `/enrich` than to any
// tenant-scoped, permission-gated route in this design.
const eventBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'application', 'eventType'],
  properties: {
    tenant: { type: 'string', minLength: 1 },
    application: { type: 'string', minLength: 1 },
    // Well-formedness only -- lowercase dot-segments matching the
    // `auth.<event>` / `request` / `client.<eventType>` taxonomy (ADR 0035).
    // The *allowlist* check (client-originated events only) happens in the
    // handler below, not here.
    eventType: {
      type: 'string',
      pattern: '^request$|^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+$',
    },
    // Present only when a valid session existed at event time -- omitted
    // entirely otherwise, never a null placeholder (Story 001).
    identityHash: { type: 'string', minLength: 1 },
    // auth.* event fields (ADR 0058).
    idp: { type: 'string', minLength: 1 },
    reason: {
      type: 'string',
      enum: ['state_mismatch', 'pkce_missing', 'token_exchange_failed', 'userinfo_failed', 'incomplete_profile'],
    },
    // request event fields.
    method: { type: 'string', minLength: 1 },
    path: { type: 'string', minLength: 1 },
    status: { type: 'integer', minimum: 100, maximum: 599 },
    latencyMs: { type: 'number', minimum: 0 },
    // client.<eventType> field -- shape is the allowlist's concern, not a
    // fixed column set here (mirrors chronicle's own `clientPayload`
    // treatment, ADR 0085). No IP field exists anywhere in this schema --
    // structurally unreachable, not merely rejected after the fact
    // (ADR 0035's unconditional no-IP rule).
    payload: { type: 'object' },
  },
} as const

interface EventBody {
  tenant: string
  application: string
  eventType: string
  identityHash?: string
  idp?: string
  reason?: string
  method?: string
  path?: string
  status?: number
  latencyMs?: number
  payload?: Record<string, unknown>
}

const eventRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/events', { schema: { body: eventBodySchema } }, async (request, reply) => {
    const body = request.body as EventBody

    if (isClientEventType(body.eventType)) {
      // Client-originated (forwarded through portcullis's local route) --
      // semi-trusted input, gets the defenses Story 001 names explicitly,
      // all enforced *here*, not upstream ("portcullis's job here is
      // identity attachment and routing, not payload validation").
      if (!app.clientEventAllowlist.has(body.eventType)) {
        return reply.code(400).send({ error: `unrecognized client event type: ${body.eventType}` })
      }

      if (body.payload !== undefined) {
        const payloadBytes = Buffer.byteLength(JSON.stringify(body.payload), 'utf8')
        if (payloadBytes > app.clientPayloadMaxBytes) {
          // Rejected outright, never truncated (Story 001).
          return reply.code(413).send({ error: 'client payload exceeds size cap' })
        }
      }

      // Scoped per tenant/application/identityHash -- per-source-IP is
      // explicitly not an option, since IP is never captured anywhere in
      // this pipeline and adding it just for rate-limiting would violate
      // that same rule (ADR 0035).
      const rateLimitKey = `${body.tenant}:${body.application}:${body.identityHash ?? 'anonymous'}`
      if (!app.rateLimiter.consume(rateLimitKey)) {
        return reply.code(429).send({ error: 'rate limit exceeded' })
      }
    }
    // Server-side-originated events (`request`, `auth.*`) are trusted input
    // -- no size cap, no type-allowlist check beyond the well-formedness
    // the schema above already enforces (Story 001).

    const eventId = app.nextEventId()
    const event = {
      ...body,
      eventId,
      // Assigned at ingestion -- nothing upstream of lookout ever sets a
      // timestamp on these events, and chronicle's schema (ADR 0085)
      // requires one.
      timestamp: new Date().toISOString(),
    }

    // The event's own eventType field IS the routing key convention -- no
    // separate routing-key mapping layer (Story 001).
    const routingKey = `analytics.${body.eventType}`

    await app.publisher.publish(routingKey, event)

    return reply.code(202).send({ eventId })
  })
}

export default eventRoutes
