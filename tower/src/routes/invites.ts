import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { InviteState } from '../actors/invite_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { RoleDefinitionState } from '../actors/role_definition_actor.js'
import type { PermissionGrant } from '../actors/account_actor.js'
import { encryptForHerald, serializeEnvelope } from '../lib/herald-payload-crypto.js'
import { requirePermission } from '../lib/permissions.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/stories/tower/007-invites-and-invite-codes.md. The
// general-purpose, admin-facing counterpart to `routes/provisioning.ts`'s
// own deterministic first-admin bootstrap invite -- same `invite` actor,
// same herald-publish contract, but a random (not deterministic) token
// and a caller-chosen `application`/`roles`/`permissions` instead of the
// bootstrap flow's fixed elevated-permissions set.
//
// **Not fully specified anywhere, this route's own reasonable
// interpretation**: which host the invite-acceptance link points at.
// Story 007's own "Not Covered Here" section explicitly punts on "how the
// token actually survives... through the OAuth2 round-trip" as portcullis's
// concern, but doesn't pin down which *host* herald's template should
// render into the link for a non-bootstrap, non-`_admin` invite. This
// route resolves it the same way `provisioning.ts`'s bootstrap flow does
// when `application` is unset (tenant-wide → `admin.{tenantSlug}.
// {baseDomain}`), and otherwise uses the target application's own primary
// host (`hosts[0]`) -- falling back to the tenant admin host if that
// application has none, rather than failing the whole request over a
// template-rendering detail.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const inviteParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'token'],
  properties: { tenantSlug: { type: 'string' }, token: { type: 'string' } },
} as const

const listQuerySchema = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['pending', 'accepted', 'revoked', 'expired'] } },
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

const permissionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['grant', 'scope', 'maxOutstanding'],
  properties: {
    grant: { type: 'string', minLength: 1 },
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
    maxOutstanding: { type: ['integer', 'null'] },
  },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contactId'],
  properties: {
    contactId: { type: 'string', minLength: 1 },
    application: { type: 'string', minLength: 1 },
    roles: { type: 'array', items: roleSchema },
    // Elevated-bootstrap case only (ADR 0021/0067) -- an ordinary admin
    // issuing a normal product invite simply omits this. Unlike
    // `invite-codes.ts`, this field is deliberately present here: `invite`
    // is single-recipient and admin/operator-issued, not the publicly
    // shareable privilege-escalation surface a code would be (Story 007's
    // own stated reasoning).
    permissions: { type: 'array', items: permissionSchema },
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

async function fetchInvite(app: FastifyInstance, tenantSlug: string, token: string): Promise<InviteState | null> {
  const instance = await app.consequent.fetch('invite', token)
  const state = instance?.state as unknown as InviteState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

function toResponse(token: string, state: InviteState) {
  return {
    token,
    tenant: state.tenant,
    application: state.application,
    contactId: state.contactId,
    roles: state.roles,
    permissions: state.permissions,
    status: state.status,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
  }
}

// See this file's own header comment for the "which host" reasoning.
async function resolveInviteHost(app: FastifyInstance, tenantSlug: string, application: string | null): Promise<string> {
  const baseDomain = app.provisioningConfig.baseDomain
  const tenantAdminHost = `admin.${tenantSlug}.${baseDomain}`
  if (!application) return tenantAdminHost
  const instance = await app.consequent.fetch('application', `${tenantSlug}:${application}`)
  const state = instance?.state as unknown as ApplicationState | undefined
  return state?.hosts?.[0] ?? tenantAdminHost
}

async function publishInviteSent(app: FastifyInstance, tenantSlug: string, tenantName: string, application: string | null, token: string, contactId: string) {
  const contact = await app.contactStore.findById(contactId)
  if (!contact) return // contact was erased between invite creation and publish -- nothing to send

  const host = await resolveInviteHost(app, tenantSlug, application)
  const envelope = encryptForHerald(app.heraldPayloadKey, {
    to: contact.email,
    templateData: { tenant: { name: tenantName }, token, adminHost: host },
  })
  await app.publisher.publish('comms.transactional.invite-sent', {
    idempotencyKey: `invite:${token}:sent`,
    tenant: tenantSlug,
    application: application ?? '_admin',
    contactId,
    category: 'transactional',
    type: 'invite-sent',
    title: `You're invited to ${tenantName}`,
    templateVersion: 1,
    encryptedPayload: serializeEnvelope(envelope),
    payloadKeyVersion: envelope.keyVersion,
    channel: 'email',
  })
}

const invitesRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const { status } = request.query as { status?: InviteState['status'] }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      const instances = status
        ? await app.consequent.find('invite', searchCriteria({ tenant: tenantSlug, status }))
        : await app.consequent.find('invite', searchCriteria({ tenant: tenantSlug }))
      // `token` (the actor's own `identifiedBy` field) isn't part of
      // `InviteState`'s own declared shape -- it's `consequent`'s own
      // generic bookkeeping (`populateActorState` sets both `state.id` and
      // `state[identifiedBy]` to the id an actor was created/fetched
      // with), present on every actor instance at runtime regardless of
      // whether the actor module's own state type lists it.
      return instances
        .map((i) => ({ token: (i.state as unknown as { token: string }).token, state: i.state as unknown as InviteState }))
        .map(({ token, state }) => toResponse(token, state))
    },
  )

  app.get(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema } },
    async (request, reply) => {
      const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }
      const state = await fetchInvite(app, tenantSlug, token)
      if (!state) return reply.code(404).send()
      return toResponse(token, state)
    },
  )

  app.post(
    '/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('invite:send') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as {
        contactId: string
        application?: string
        roles?: Array<{ name: string, scope: Scope }>
        permissions?: PermissionGrant[]
        expiresAt?: string | null
      }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      if (!(await rolesValid(app, tenantSlug, body.roles))) {
        return reply.code(400).send({ error: 'roles must reference existing, active role definitions for this tenant' })
      }

      const token = randomBytes(20).toString('hex')
      await app.consequent.handle(token, 'invite.create', {
        tenant: tenantSlug,
        application: body.application ?? null,
        contactId: body.contactId,
        roles: body.roles ?? [],
        permissions: body.permissions ?? [],
        expiresAt: body.expiresAt ?? null,
      })

      await publishInviteSent(app, tenantSlug, tenant.name, body.application ?? null, token, body.contactId)

      const created = await fetchInvite(app, tenantSlug, token)
      return reply.code(201).send(toResponse(token, created!))
    },
  )

  app.patch(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema, body: patchBodySchema }, preHandler: requirePermission('invite:send') },
    async (request, reply) => {
      const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }

      const current = await fetchInvite(app, tenantSlug, token)
      if (!current) return reply.code(404).send()

      const results = await app.consequent.handle(token, 'invite.revoke', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      const updated = await fetchInvite(app, tenantSlug, token)
      return toResponse(token, updated!)
    },
  )

  // Soft alias for `PATCH { status: "revoked" }` (ADR 0053).
  app.delete(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema }, preHandler: requirePermission('invite:send') },
    async (request, reply) => {
      const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }
      const current = await fetchInvite(app, tenantSlug, token)
      if (!current) return reply.code(404).send()

      if (current.status === 'revoked') {
        // Retry converges rather than erroring -- same "retry-same-request
        // is the recovery model" convention every other soft-delete route
        // in this codebase follows.
        return toResponse(token, current)
      }

      const results = await app.consequent.handle(token, 'invite.revoke', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      const updated = await fetchInvite(app, tenantSlug, token)
      return toResponse(token, updated!)
    },
  )
}

export default invitesRoutes
