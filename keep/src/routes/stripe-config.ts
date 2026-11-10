import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../lib/permissions.js'
import { effectivePaymentFailureAttempts } from '../lib/stripe-config.js'

// Per design/stories/keep/001-actor-definitions.md ("stripe-config") and
// design/stories/keep/006-self-service-config-and-activity.md.
//
// Not a consequent actor -- secret-only storage, write-only (`GET` never
// returns the secret key/webhook secret). `PATCH` validates the key at set
// time with a cheap Stripe API call (ADR 0054) before accepting it. Real
// signet wiring (pushing the secrets to keep's own signet bundle, ADR 0052)
// is out of scope for this pilot slice -- `app.stripeConfig` is the
// in-memory stand-in seam (see src/lib/stripe-config.ts, TESTING.md).
//
// ADR 0107 adds one non-secret setting, `paymentFailureAttempts`: the
// failed attempts on one invoice at which keep degrades a subscription's
// plan roles. `GET` returns it, `3` when the tenant never set it. `PATCH`
// takes it alone or beside the two secrets, which still come as a pair.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  dependencies: {
    secretKey: ['webhookSecret'],
    webhookSecret: ['secretKey'],
  },
  properties: {
    secretKey: { type: 'string', minLength: 1 },
    webhookSecret: { type: 'string', minLength: 1 },
    paymentFailureAttempts: { type: 'integer', minimum: 1 },
  },
} as const

interface PatchBody {
  secretKey?: string
  webhookSecret?: string
  paymentFailureAttempts?: number
}

const stripeConfigRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/stripe-config',
    { schema: { params: tenantParamsSchema }, preHandler: requirePermission('billing:manage') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const config = await app.stripeConfig.get(tenantSlug)
      const ownAttempts = await app.stripeConfig.getPaymentFailureAttempts(tenantSlug)
      if (!config && ownAttempts === undefined) return reply.code(404).send()
      // Never returns stripeSecretKey/stripeWebhookSecret -- write-only,
      // same discipline as every other secret in this design.
      return {
        configured: config !== undefined,
        paymentFailureAttempts: await effectivePaymentFailureAttempts(app.stripeConfig, tenantSlug),
      }
    },
  )

  app.patch(
    '/tenants/:tenantSlug/stripe-config',
    { schema: { params: tenantParamsSchema, body: patchBodySchema }, preHandler: requirePermission('billing:manage') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as PatchBody

      // The schema's `dependencies` keep the two secrets a pair.
      if (body.secretKey !== undefined && body.webhookSecret !== undefined) {
        const client = app.stripeClients.dial(body.secretKey)
        const valid = await client.validateApiKey(body.secretKey)
        if (!valid) {
          return reply.code(400).send({ error: 'stripe secret key failed validation' })
        }
        await app.stripeConfig.set(tenantSlug, { secretKey: body.secretKey, webhookSecret: body.webhookSecret })
      }

      if (body.paymentFailureAttempts !== undefined) {
        await app.stripeConfig.setPaymentFailureAttempts(tenantSlug, body.paymentFailureAttempts)
      }

      return {
        configured: (await app.stripeConfig.get(tenantSlug)) !== undefined,
        paymentFailureAttempts: await effectivePaymentFailureAttempts(app.stripeConfig, tenantSlug),
      }
    },
  )
}

export default stripeConfigRoutes
