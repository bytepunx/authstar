import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { CouponState, GrantedRole } from '../actors/coupon_actor.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/keep/004-trials-and-coupons.md ("Coupons"). `{code}`
// in the URL is the bare code -- constructed into the full
// `{tenantSlug}:{code}` key internally, never exposed to callers (same
// pattern as tower's `provider`/`inviteCode`). Redemption itself isn't a
// route on this surface (Story 004) -- see coupon_actor.ts's `redeem`
// command for the mechanism a future checkout-flow story would call.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const codeParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'code'],
  properties: { tenantSlug: { type: 'string' }, code: { type: 'string' } },
} as const

const grantedRoleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['application', 'role'],
  properties: {
    application: { type: 'string', minLength: 1 },
    role: { type: 'string', minLength: 1 },
  },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1 },
    grantedRoles: { type: 'array', items: grantedRoleSchema },
    trialDurationDays: { type: ['integer', 'null'], minimum: 1 },
    seatLimit: { type: ['integer', 'null'], minimum: 1 },
    maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
    expiresAt: { type: ['string', 'null'] },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['revoked'] },
  },
} as const

function couponKey(tenantSlug: string, code: string): string {
  return `${tenantSlug}:${code}`
}

async function fetchCoupon(app: FastifyInstance, key: string): Promise<CouponState> {
  const instance = await app.consequent.fetch('coupon', key)
  return instance!.state as unknown as CouponState
}

function exists(state: CouponState): boolean {
  return Boolean(state.createdAt)
}

function toResponse(state: CouponState) {
  const { createdAt: _createdAt, key: _key, ...rest } = state
  return rest
}

const couponRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/coupons', { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as {
      code: string
      grantedRoles?: GrantedRole[]
      trialDurationDays?: number | null
      seatLimit?: number | null
      maxRedemptions?: number | null
      expiresAt?: string | null
    }

    const grantedRoles = body.grantedRoles ?? []
    await app.roleBackfill.ensureFresh(tenantSlug)
    const validation = app.roleCache.validateAll(tenantSlug, grantedRoles)
    if (!validation.valid) {
      return reply.code(400).send({ error: 'grantedRoles references an unknown or inactive application/role', invalid: validation.invalid })
    }

    const key = couponKey(tenantSlug, body.code)
    const results = await app.consequent.handle(key, 'coupon.create', {
      key,
      code: body.code,
      tenant: tenantSlug,
      grantedRoles,
      trialDurationDays: body.trialDurationDays ?? null,
      seatLimit: body.seatLimit ?? null,
      maxRedemptions: body.maxRedemptions ?? null,
      expiresAt: body.expiresAt ?? null,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const created = await fetchCoupon(app, key)
    return reply.code(201).send(toResponse(created))
  })

  app.get('/tenants/:tenantSlug/coupons', { schema: { params: tenantParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instances = await app.consequent.find('coupon', searchCriteria({ tenant: tenantSlug }))
    return instances.map((i) => i.state as unknown as CouponState).filter(exists).map(toResponse)
  })

  app.get('/tenants/:tenantSlug/coupons/:code', { schema: { params: codeParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }
    const state = await fetchCoupon(app, couponKey(tenantSlug, code))
    if (!exists(state)) return reply.code(404).send()
    return toResponse(state)
  })

  app.patch('/tenants/:tenantSlug/coupons/:code', { schema: { params: codeParamsSchema, body: patchBodySchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }
    const key = couponKey(tenantSlug, code)
    const current = await fetchCoupon(app, key)
    if (!exists(current)) return reply.code(404).send()

    const results = await app.consequent.handle(key, 'coupon.revoke', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

    const updated = await fetchCoupon(app, key)
    return toResponse(updated)
  })

  app.delete('/tenants/:tenantSlug/coupons/:code', { schema: { params: codeParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }
    const key = couponKey(tenantSlug, code)
    const current = await fetchCoupon(app, key)
    if (!exists(current)) return reply.code(404).send()

    const results = await app.consequent.handle(key, 'coupon.revoke', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

    const updated = await fetchCoupon(app, key)
    return toResponse(updated)
  })
}

export default couponRoutes
