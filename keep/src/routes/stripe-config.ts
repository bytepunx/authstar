import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

// Per design/stories/keep/001-actor-definitions.md ("stripe-config") and
// design/stories/keep/006-self-service-config-and-activity.md.
//
// Not a consequent actor -- secret-only storage, write-only (`GET` never
// returns the secret key/webhook secret). `PATCH` validates the key at set
// time with a cheap Stripe API call (ADR 0054) before accepting it. Real
// signet wiring (pushing the secrets to keep's own signet bundle, ADR 0052)
// is out of scope for this pilot slice -- `app.stripeConfig` is the
// in-memory stand-in seam (see src/lib/stripe-config.ts, TESTING.md).

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['secretKey', 'webhookSecret'],
  properties: {
    secretKey: { type: 'string', minLength: 1 },
    webhookSecret: { type: 'string', minLength: 1 },
  },
} as const

const stripeConfigRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/stripe-config', { schema: { params: tenantParamsSchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const config = await app.stripeConfig.get(tenantSlug)
    if (!config) return reply.code(404).send()
    // Never returns stripeSecretKey/stripeWebhookSecret -- write-only,
    // same discipline as every other secret in this design.
    return { configured: true }
  })

  app.patch('/tenants/:tenantSlug/stripe-config', { schema: { params: tenantParamsSchema, body: patchBodySchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as { secretKey: string, webhookSecret: string }

    const client = app.stripeClients.dial(body.secretKey)
    const valid = await client.validateApiKey(body.secretKey)
    if (!valid) {
      return reply.code(400).send({ error: 'stripe secret key failed validation' })
    }

    await app.stripeConfig.set(tenantSlug, { secretKey: body.secretKey, webhookSecret: body.webhookSecret })
    return { configured: true }
  })
}

export default stripeConfigRoutes
