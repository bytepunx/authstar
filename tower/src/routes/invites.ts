import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { InviteState } from '../actors/invite_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { OrganizationState } from '../actors/organization_actor.js'
import type { PermissionGrant } from '../actors/account_actor.js'
import { encryptForHerald, serializeEnvelope } from '../lib/herald-payload-crypto.js'
import { requirePermission, requireOrganizationManager } from '../lib/permissions.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { rolesValid, organizationRolesValid, type Scope } from '../lib/role-definition-lookup.js'
import { requireOperatorAuth, requireOperatorActor, operatorActor } from '../lib/operator-auth.js'

// Per design/stories/tower/007-invites-and-invite-codes.md. The
// general-purpose, admin-facing counterpart to `routes/provisioning.ts`'s
// own deterministic first-admin bootstrap invite -- same `invite` actor,
// same herald-publish contract, but a random (not deterministic) token
// and a caller-chosen `application`/`roles`/`permissions` instead of the
// bootstrap flow's fixed elevated-permissions set.
//
// **Not fully specified anywhere, this route's own reasonable
// interpretation**: which host the invite-acceptance link points at. This
// route resolves it the same way `provisioning.ts`'s bootstrap flow does
// when `application` is unset (tenant-wide → `authstar.<tenant.domain>`,
// ADR 0091), and otherwise uses the target application's own primary host
// (`hosts[0]`) -- falling back to the tenant admin host if that application
// has none, rather than failing the whole request over a
// template-rendering detail. Invite-token survival through the OAuth round
// trip itself is resolved by ADR 0092.
//
// Story 013: the "bootstrap path" for admin access ("issue an elevated
// invite") reuses `POST`/`DELETE`/`PATCH` below via the operator tree --
// same pattern as `routes/accounts.ts`'s own header comment describes.

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
  properties: {
    // ADR 0091: either works -- `contactId` for a caller that already
    // resolved one (e.g. from the accounts-search UI), `email` for the
    // common "invite someone who's never been seen before" case, which
    // `GET .../contacts?email=` can't help with since it only *finds*, never
    // creates. Mirrors provisioning.ts's own bootstrap-invite step exactly
    // (`contactStore.upsert`), not a second contact-resolution mechanism.
    contactId: { type: 'string', minLength: 1 },
    email: { type: 'string', minLength: 3 },
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
  anyOf: [{ required: ['contactId'] }, { required: ['email'] }],
} as const

const organizationParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' } },
} as const

const createOrganizationInviteBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['organizationRole'],
  properties: {
    contactId: { type: 'string', minLength: 1 },
    email: { type: 'string', minLength: 3 },
    // ADR 0100: any org-scope role name (validated against the tenant's
    // roleDefinition catalog at write time), not a fixed 'member'|'manager'
    // enum -- the invitee always ends up a 'member' regardless (see
    // organizations.ts's own `rolesForNewMembership`), this is what's
    // layered on top.
    organizationRole: { type: 'string', minLength: 1 },
    expiresAt: { type: ['string', 'null'] },
  },
  anyOf: [{ required: ['contactId'] }, { required: ['email'] }],
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['revoked'] } },
} as const

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
    organizationId: state.organizationId,
    organizationRole: state.organizationRole,
    status: state.status,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
  }
}

// See this file's own header comment for the "which host" reasoning.
async function resolveInviteHost(app: FastifyInstance, tenantSlug: string, application: string | null): Promise<string> {
  const tenantInstance = await app.consequent.fetch('tenant', tenantSlug)
  const tenantDomain = (tenantInstance?.state as { domain?: string } | undefined)?.domain ?? ''
  const tenantAdminHost = `authstar.${tenantDomain}`
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

async function listInvites(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { status } = request.query as { status?: InviteState['status'] }

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  const instances = status
    ? await app.consequent.find('invite', searchCriteria({ tenant: tenantSlug, status }))
    : await app.consequent.find('invite', searchCriteria({ tenant: tenantSlug }))
  // `token` (the actor's own `identifiedBy` field) isn't part of
  // `InviteState`'s own declared shape -- it's `consequent`'s own generic
  // bookkeeping (`populateActorState` sets both `state.id` and
  // `state[identifiedBy]` to the id an actor was created/fetched with),
  // present on every actor instance at runtime regardless of whether the
  // actor module's own state type lists it.
  return instances
    .map((i) => ({ token: (i.state as unknown as { token: string }).token, state: i.state as unknown as InviteState }))
    .map(({ token, state }) => toResponse(token, state))
}

async function getInvite(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }
  const state = await fetchInvite(app, tenantSlug, token)
  if (!state) return reply.code(404).send()
  return toResponse(token, state)
}

async function createInvite(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const body = request.body as {
    contactId?: string
    email?: string
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

  // ADR 0091: `email` resolves (find-or-create, same as provisioning.ts's
  // own bootstrap invite) to a contactId here -- the schema's `anyOf`
  // guarantees at least one of the two is present.
  const contactId = body.contactId ?? (await app.contactStore.upsert(tenantSlug, body.email!)).id

  const token = randomBytes(20).toString('hex')
  await app.consequent.handle(token, 'invite.create', {
    tenant: tenantSlug,
    application: body.application ?? null,
    contactId,
    roles: body.roles ?? [],
    permissions: body.permissions ?? [],
    expiresAt: body.expiresAt ?? null,
    actingAs: operatorActor(request),
  })

  await publishInviteSent(app, tenantSlug, tenant.name, body.application ?? null, token, contactId)

  const created = await fetchInvite(app, tenantSlug, token)
  return reply.code(201).send(toResponse(token, created!))
}

// ADR 0100: an org manager's own invite-creation path -- narrower than
// createInvite above (no application/roles/general permissions), reusing
// the same invite actor and herald-publish machinery. `organizationRole`
// is any org-scope role name (validated against the tenant's roleDefinition
// catalog); the invitee always ends up a plain 'member' too on redemption
// (organizations.ts's `rolesForNewMembership`), same as every other path
// onto the roster.
async function createOrganizationInvite(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const body = request.body as { contactId?: string, email?: string, organizationRole: string, expiresAt?: string | null }

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  const orgInstance = await app.consequent.fetch('organization', organizationId)
  const org = orgInstance?.state as unknown as OrganizationState | undefined
  if (!org?.createdAt || org.tenant !== tenantSlug) return reply.code(404).send()

  if (!(await organizationRolesValid(app, tenantSlug, [body.organizationRole]))) {
    return reply.code(400).send({ error: 'organizationRole must reference an existing, active organization role definition for this tenant' })
  }

  // ADR 0091: `email` resolves (find-or-create) to a contactId here, same
  // as `createInvite`'s own identical fallback -- the schema's `anyOf`
  // guarantees at least one of the two is present.
  const contactId = body.contactId ?? (await app.contactStore.upsert(tenantSlug, body.email!)).id

  const token = randomBytes(20).toString('hex')
  await app.consequent.handle(token, 'invite.create', {
    tenant: tenantSlug,
    application: null,
    contactId,
    roles: [],
    permissions: [],
    organizationId,
    organizationRole: body.organizationRole,
    expiresAt: body.expiresAt ?? null,
    actingAs: operatorActor(request),
  })

  await publishInviteSent(app, tenantSlug, tenant.name, null, token, contactId)

  const created = await fetchInvite(app, tenantSlug, token)
  return reply.code(201).send(toResponse(token, created!))
}

async function patchInvite(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }

  const current = await fetchInvite(app, tenantSlug, token)
  if (!current) return reply.code(404).send()

  const results = await app.consequent.handle(token, 'invite.revoke', { actingAs: operatorActor(request) })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  const updated = await fetchInvite(app, tenantSlug, token)
  return toResponse(token, updated!)
}

// Soft alias for `PATCH { status: "revoked" }` (ADR 0053).
async function deleteInvite(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, token } = request.params as { tenantSlug: string, token: string }
  const current = await fetchInvite(app, tenantSlug, token)
  if (!current) return reply.code(404).send()

  if (current.status === 'revoked') {
    // Retry converges rather than erroring -- same "retry-same-request is
    // the recovery model" convention every other soft-delete route in this
    // codebase follows.
    return toResponse(token, current)
  }

  const results = await app.consequent.handle(token, 'invite.revoke', { actingAs: operatorActor(request) })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  const updated = await fetchInvite(app, tenantSlug, token)
  return toResponse(token, updated!)
}

const invitesRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    (request, reply) => listInvites(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema } },
    (request, reply) => getInvite(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('invite:send') },
    (request, reply) => createInvite(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/invites',
    { schema: { params: organizationParamsSchema, body: createOrganizationInviteBodySchema }, preHandler: requireOrganizationManager() },
    (request, reply) => createOrganizationInvite(app, request, reply),
  )

  app.patch(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema, body: patchBodySchema }, preHandler: requirePermission('invite:send') },
    (request, reply) => patchInvite(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema }, preHandler: requirePermission('invite:send') },
    (request, reply) => deleteInvite(app, request, reply),
  )

  // Story 013: the operator tree -- same handlers, bearer-token auth
  // instead of `permissions`, mutations additionally require
  // `X-Operator-Actor`.
  app.get(
    '/operator/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => listInvites(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => getInvite(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/invites',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => createInvite(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/invites',
    { schema: { params: organizationParamsSchema, body: createOrganizationInviteBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => createOrganizationInvite(app, request, reply),
  )

  app.patch(
    '/operator/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema, body: patchBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => patchInvite(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/invites/:token',
    { schema: { params: inviteParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => deleteInvite(app, request, reply),
  )
}

export default invitesRoutes
