import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { InviteCodeState } from '../actors/invite_code_actor.js'
import type { RoleDefinitionState } from '../actors/role_definition_actor.js'
import type { AccountState, PermissionGrant } from '../actors/account_actor.js'
import { requirePermission } from '../lib/permissions.js'
import { createKeyedMutex } from '../lib/mutex.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/stories/tower/007-invites-and-invite-codes.md. `inviteCode`
// built from scratch this pass -- see `actors/invite_code_actor.ts`'s own
// header comment for the actor shape/key reasoning.
//
// **No `permissions` field exists on this route's body schema at all** --
// a deliberate, security-relevant omission per the story's own text, not
// an oversight: `invite` can carry elevated `permissions` because it's
// single-recipient and admin/operator-issued; `inviteCode` is publicly
// shareable by design (ADR 0019's referral/social-distribution case), and
// a shareable code that could grant tower `permissions` to anyone who
// redeems it would be a real privilege-escalation surface. Enforced by
// the schema itself (no `permissions` property declared, and
// `additionalProperties: false` rejects one if sent), not just documented.

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

const listQuerySchema = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['active', 'revoked', 'expired'] } },
} as const

const roleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'scope'],
  properties: {
    name: { type: 'string', minLength: 1 },
    scope: {
      oneOf: [
        { type: 'string', enum: ['tenant'] },
        {
          type: 'object',
          additionalProperties: false,
          required: ['application'],
          properties: { application: { type: 'string', minLength: 1 } },
        },
      ],
    },
  },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1 },
    application: { type: 'string' },
    roles: { type: 'array', items: roleSchema },
    trialDurationDays: { type: ['integer', 'null'], minimum: 1 },
    maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
    expiresAt: { type: ['string', 'null'] },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['revoked'] } },
} as const

type Scope = 'tenant' | { application: string }

// See `src/lib/mutex.ts`'s own header comment for why this exists: closes
// a real concurrent-duplicate-key race `consequent`'s own per-actor queue
// does not, by itself, prevent -- same reasoning `role-definitions.ts`'s
// own `roleDefinitionMutex` documents.
const inviteCodeMutex = createKeyedMutex()

function inviteCodeKey(tenantSlug: string, code: string): string {
  return `${tenantSlug}:${code}`
}

function roleDefinitionKey(tenantSlug: string, name: string, scope: Scope): string {
  return scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
}

async function activeRoleDefinitionExists(app: FastifyInstance, tenantSlug: string, name: string, scope: Scope): Promise<boolean> {
  const instance = await app.consequent.fetch('roleDefinition', roleDefinitionKey(tenantSlug, name, scope))
  const state = instance?.state as unknown as RoleDefinitionState | undefined
  return Boolean(state?.createdAt) && state?.status === 'active'
}

async function rolesValid(app: FastifyInstance, tenantSlug: string, roles: Array<{ name: string, scope: Scope }> | undefined): Promise<boolean> {
  if (!roles || roles.length === 0) return true
  for (const role of roles) {
    if (!(await activeRoleDefinitionExists(app, tenantSlug, role.name, role.scope))) return false
  }
  return true
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function fetchInviteCode(app: FastifyInstance, tenantSlug: string, code: string): Promise<InviteCodeState | null> {
  const instance = await app.consequent.fetch('inviteCode', inviteCodeKey(tenantSlug, code))
  const state = instance?.state as unknown as InviteCodeState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

function toResponse(state: InviteCodeState) {
  return {
    code: state.code,
    tenant: state.tenant,
    application: state.application,
    issuedBy: state.issuedBy,
    roles: state.roles,
    trialDurationDays: state.trialDurationDays,
    maxRedemptions: state.maxRedemptions,
    redemptionCount: state.redemptionCount,
    status: state.status,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
  }
}

// ADR 0019: `invite:code:issue` isn't admin-exclusive -- any account
// holding it can issue a code, scoped by its own `maxOutstanding` (a
// property of the *permission grant itself*, ADR 0051's catalog: "tenant
// or {application}, plus maxOutstanding" -- not a request-body field).
// `request.authstar`'s own `permissions` claim is a flat grant-string
// array (confirmed directly against `spec/lib/internal-jwt.ts`'s real
// fixture shape and `@bytepunx/authstar-fastify`'s `InternalClaims` type --
// portcullis flattens `account.permissions` to grant strings when minting
// the token, dropping the per-grant `maxOutstanding`/`scope` metadata,
// since that's irrelevant to the boolean allow/deny `requirePermission`
// needs). So `maxOutstanding` isn't readable from the token at all --
// this looks it up from the caller's own `account.permissions` record
// instead, via `request.authstar.accountId` (also a real token claim).
// `null` means unlimited, matching every other actor's "no cap" sentinel
// convention in this codebase.
async function callerMaxOutstanding(app: FastifyInstance, accountId: string | undefined): Promise<number | null> {
  if (!accountId) return null
  const instance = await app.consequent.fetch('account', accountId)
  const state = instance?.state as unknown as AccountState | undefined
  const grant = state?.permissions.find((p: PermissionGrant) => p.grant === 'invite:code:issue')
  return grant?.maxOutstanding ?? null
}

async function callerOutstandingCount(app: FastifyInstance, tenantSlug: string, accountId: string): Promise<number> {
  const instances = await app.consequent.find('inviteCode', searchCriteria({ tenant: tenantSlug, issuedBy: accountId, status: 'active' }))
  return instances.length
}

const inviteCodesRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/invite-codes',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const { status } = request.query as { status?: InviteCodeState['status'] }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      const instances = status
        ? await app.consequent.find('inviteCode', searchCriteria({ tenant: tenantSlug, status }))
        : await app.consequent.find('inviteCode', searchCriteria({ tenant: tenantSlug }))
      return instances.map((i) => toResponse(i.state as unknown as InviteCodeState))
    },
  )

  app.get(
    '/tenants/:tenantSlug/invite-codes/:code',
    { schema: { params: codeParamsSchema } },
    async (request, reply) => {
      const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }
      const state = await fetchInviteCode(app, tenantSlug, code)
      if (!state) return reply.code(404).send()
      return toResponse(state)
    },
  )

  app.post(
    '/tenants/:tenantSlug/invite-codes',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('invite:code:issue') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as {
        code: string
        application?: string
        roles?: Array<{ name: string, scope: Scope }>
        trialDurationDays?: number | null
        maxRedemptions?: number | null
        expiresAt?: string | null
      }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      if (!(await rolesValid(app, tenantSlug, body.roles))) {
        return reply.code(400).send({ error: 'roles must reference existing, active role definitions for this tenant' })
      }

      const accountId = request.authstar?.accountId
      const maxOutstanding = await callerMaxOutstanding(app, accountId)
      if (maxOutstanding !== null && accountId) {
        const outstanding = await callerOutstandingCount(app, tenantSlug, accountId)
        if (outstanding >= maxOutstanding) {
          return reply.code(409).send({ error: `already at your maxOutstanding limit (${maxOutstanding}) for invite:code:issue` })
        }
      }

      const key = inviteCodeKey(tenantSlug, body.code)
      const results = await inviteCodeMutex.runExclusive(key, () => app.consequent.handle(key, 'inviteCode.create', {
        tenant: tenantSlug,
        code: body.code,
        application: body.application ?? '',
        issuedBy: accountId ?? '',
        roles: body.roles ?? [],
        trialDurationDays: body.trialDurationDays ?? null,
        maxRedemptions: body.maxRedemptions ?? null,
        expiresAt: body.expiresAt ?? null,
      }))
      const rejection = results.find((r) => r?.rejected)
      if (rejection) {
        return reply.code(409).send({ error: rejection.reason?.message })
      }

      const created = await fetchInviteCode(app, tenantSlug, body.code)
      return reply.code(201).send(toResponse(created!))
    },
  )

  app.patch(
    '/tenants/:tenantSlug/invite-codes/:code',
    { schema: { params: codeParamsSchema, body: patchBodySchema }, preHandler: requirePermission('invite:code:issue') },
    async (request, reply) => {
      const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }

      const current = await fetchInviteCode(app, tenantSlug, code)
      if (!current) return reply.code(404).send()

      const key = inviteCodeKey(tenantSlug, code)
      const results = await app.consequent.handle(key, 'inviteCode.revoke', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      const updated = await fetchInviteCode(app, tenantSlug, code)
      return toResponse(updated!)
    },
  )

  // Soft alias for `PATCH { status: "revoked" }` (ADR 0053).
  app.delete(
    '/tenants/:tenantSlug/invite-codes/:code',
    { schema: { params: codeParamsSchema }, preHandler: requirePermission('invite:code:issue') },
    async (request, reply) => {
      const { tenantSlug, code } = request.params as { tenantSlug: string, code: string }
      const current = await fetchInviteCode(app, tenantSlug, code)
      if (!current) return reply.code(404).send()

      if (current.status === 'revoked') {
        return toResponse(current)
      }

      const key = inviteCodeKey(tenantSlug, code)
      const results = await app.consequent.handle(key, 'inviteCode.revoke', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      const updated = await fetchInviteCode(app, tenantSlug, code)
      return toResponse(updated!)
    },
  )
}

export default inviteCodesRoutes
