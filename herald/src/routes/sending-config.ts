import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { SendingConfigState } from '../actors/sending_config_actor.js'

// Per design/stories/herald/005-webhooks-config-rotation-and-activity.md.
// Gated by `sending-config:manage` in production -- no auth middleware in
// this slice. `credential`/`webhookSecret` are accepted here and handed to
// `credentialStore` (see src/lib/credential-store.ts for why that's an
// in-process stand-in, not real signet integration) -- never persisted on
// the `sendingConfig` actor's own state, never returned by GET.

function exists(state: SendingConfigState): boolean {
  return Boolean(state.configuredAt)
}

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', enum: ['smtp', 'ses', 'sendgrid'] },
    fromAddress: { type: 'string' },
    fromName: { type: 'string' },
    replyTo: { type: 'string' },
    physicalAddress: { type: 'string' },
    credential: { type: 'string' },
    webhookSecret: { type: 'string' },
  },
} as const

const sendingConfigRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/sending-config', { schema: { params: tenantParamsSchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instance = await app.consequent.fetch('sendingConfig', tenantSlug)
    const state = instance!.state as unknown as SendingConfigState
    if (!exists(state)) {
      return reply.code(404).send()
    }
    // credential/webhookSecret never returned -- write-only (Story 005).
    return state
  })

  app.patch('/tenants/:tenantSlug/sending-config', { schema: { params: tenantParamsSchema, body: patchBodySchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as {
      provider?: 'smtp' | 'ses' | 'sendgrid'
      fromAddress?: string
      fromName?: string
      replyTo?: string
      physicalAddress?: string
      credential?: string
      webhookSecret?: string
    }

    await app.consequent.handle(tenantSlug, 'sendingConfig.update', {
      tenant: tenantSlug,
      provider: body.provider,
      fromAddress: body.fromAddress,
      fromName: body.fromName,
      replyTo: body.replyTo,
      physicalAddress: body.physicalAddress,
    })

    if (body.credential !== undefined || body.webhookSecret !== undefined) {
      app.credentialStore.set(tenantSlug, {
        ...(body.credential !== undefined ? { credential: body.credential } : {}),
        ...(body.webhookSecret !== undefined ? { webhookSecret: body.webhookSecret } : {}),
      })
    }

    const instance = await app.consequent.fetch('sendingConfig', tenantSlug)
    return instance!.state
  })
}

export default sendingConfigRoutes
