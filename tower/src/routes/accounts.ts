import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { AccountState, RoleGrant, PermissionGrant } from '../actors/account_actor.js'
import { requirePermission, requireSelfOrPermission, PERMISSION_CATALOG } from '../lib/permissions.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { rolesValid } from '../lib/role-definition-lookup.js'
import { fetchMemberships, organizationManagers } from './organizations.js'
import type { OrganizationMembershipState } from '../actors/organization_membership_actor.js'

// Account-level role/permission grants are never organization-scoped
// (design/adrs/0100-...: org-granted roles live on `organization`/
// `organizationMembership`, never merged onto `account.roles`) -- narrower
// than `role-definition-lookup.ts`'s own `Scope`, which also covers
// organization-scope role *definitions* elsewhere in the catalog.
// `scopeSchema` below already enforces this at the JSON-schema level; this
// type just keeps that guarantee visible to the compiler too.
type AccountGrantScope = 'tenant' | { application: string }
import { requireOperatorAuth, requireOperatorActor, operatorActor } from '../lib/operator-auth.js'

// Per design/stories/tower/005-accounts-roles-and-permissions.md and ADR
// 0076/0070. No `POST /accounts` route exists on this surface at all --
// accounts are created only via login-time resolution (`routes/
// identities.ts`) or invite/invite-code acceptance, never directly.
//
// **Read this story's self-action rule carefully -- it has a hard
// exception, reflected exactly in which routes below use
// `requireSelfOrPermission` vs. plain `requirePermission`**: ADR 0070's
// self-action principle covers reading your own account (`GET .../
// {accountId}`), but does NOT extend to granting/revoking your own roles
// or permissions, or to changing your own status -- those always require
// the grant, even acting on yourself.
//
// Story 013: every handler below is registered *twice* -- once under the
// tenant-scoped path (permission-gated) and once under `/operator/...`
// (bearer-token-gated, no same-tenant restriction) -- same handler
// function both times, per ADR 0030's "operator tree wraps the same route
// handlers, only the auth middleware differs" pattern. Every mutating
// handler reads `operatorActor(request)`, which is `undefined` for a
// tenant-scoped call (the header is operator-route-only) and the
// `X-Operator-Actor` value for an operator-scoped one (already validated
// present by `requireOperatorActor`) -- threaded into the resulting
// event's own `actingAs` metadata, see `src/lib/acting-as.ts`.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const accountParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' } },
} as const

const changeEmailBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['newEmail'],
  properties: { newEmail: { type: 'string', minLength: 3 } },
} as const

const listQuerySchema = {
  type: 'object',
  properties: {
    email: { type: 'string', minLength: 3 },
    status: { type: 'string', enum: ['active', 'suspended', 'deleted'] },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['active', 'suspended', 'deleted'] } },
} as const

const scopeSchema = {
  oneOf: [
    { type: 'string', enum: ['tenant'] },
    {
      type: 'object',
      additionalProperties: false,
      required: ['application'],
      properties: { application: { type: 'string', minLength: 1 } },
    },
  ],
} as const

const roleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'scope'],
  properties: { name: { type: 'string', minLength: 1 }, scope: scopeSchema },
} as const

const permissionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['grant', 'scope', 'maxOutstanding'],
  properties: {
    grant: { type: 'string', minLength: 1 },
    scope: scopeSchema,
    maxOutstanding: { type: ['integer', 'null'] },
  },
} as const

// `?scope=tenant` or `?applicationScope=<slug>` -- Story 005's own suggested
// encoding (`?scope[application]=math`) needs a query parser that
// understands bracket notation, which fastify's default `querystring`
// parser does not (confirmed directly, not assumed: it parses
// `scope[application]=math` as a single literal key `"scope[application]"`,
// not a nested object) -- adopting it here would need a different, heavier
// query-string library repo-wide for one route. A second, flat query
// parameter for the application-scoped case is a reasonable, documented
// deviation that needs no new dependency.
const removalQuerySchema = {
  type: 'object',
  properties: { scope: { type: 'string', enum: ['tenant'] }, applicationScope: { type: 'string', minLength: 1 } },
} as const

const roleParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId', 'name'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' }, name: { type: 'string' } },
} as const

const permissionParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId', 'grant'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' }, grant: { type: 'string' } },
} as const

function scopeFromQuery(query: { scope?: string, applicationScope?: string }): AccountGrantScope {
  return query.applicationScope ? { application: query.applicationScope } : 'tenant'
}

async function fetchAccount(app: FastifyInstance, accountId: string): Promise<AccountState> {
  const instance = await app.consequent.fetch('account', accountId)
  return instance!.state as unknown as AccountState
}

function exists(state: AccountState): boolean {
  return Boolean(state.createdAt)
}

// Story 005: "no plaintext contact info... that's `contactId`-gated
// separately" -- `contactId` itself is excluded from every response this
// route returns, not just plaintext email/name (which this actor never
// stores at all, ADR 0023). An admin without `contacts:read` shouldn't
// even see the pointer as a hint.
function toResponse(state: AccountState) {
  const { contactId: _contactId, ...rest } = state
  return rest
}

async function listAccounts(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { email, status } = request.query as { email?: string, status?: AccountState['status'] }

  if (email !== undefined) {
    // ADR 0023/0051: resolving an email to an account necessarily
    // discloses the PII-adjacent fact "this email belongs to an account
    // here" -- the same sensitivity `contacts:read` already gates
    // elsewhere, so this one query mode needs it *in addition to*
    // `accounts:manage`, not instead of it. An operator caller (bearer
    // token, not a permissions-bearing JWT) always passes this check --
    // ADR 0021's shared operator credential is already the ceiling
    // permission for this whole surface.
    if (!operatorActor(request)) {
      const claims = request.authstar
      if (!(claims?.enrichmentStatus === 'ok' && claims.permissions.includes('contacts:read'))) {
        return reply.code(403).send({ error: 'forbidden' })
      }
    }
    const contactId = app.contactStore.computeId(tenantSlug, email)
    const instances = await app.consequent.find('account', searchCriteria({ tenant: tenantSlug, contactId }))
    return instances.map((i) => toResponse(i.state as unknown as AccountState))
  }

  const criteria: Record<string, unknown> = { tenant: tenantSlug }
  if (status) criteria.status = status
  const instances = await app.consequent.find('account', searchCriteria(criteria))
  return instances.map((i) => toResponse(i.state as unknown as AccountState))
}

async function getAccount(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
  const state = await fetchAccount(app, accountId)
  if (!exists(state) || state.tenant !== tenantSlug) return reply.code(404).send()
  return toResponse(state)
}

// ADR 0100: an account being deleted (business offboarding, not GDPR
// erasure -- see this file's own header comment) may belong to any number
// of organizations, and be a manager of some of them. Every active
// membership is revoked; a membership holding 'manager' gets the same
// auto-succession attempt `organizations.ts`'s own `guardLastManager` makes
// -- but unlike a self-service or peer-initiated removal, this never
// rejects: the account is already gone and can't functionally hold the
// role regardless. An organization left with zero managers (no successor
// designated, or the successor is no longer a member) is a real, accepted
// edge case needing operator intervention, not a reason to fail the
// deletion itself.
async function detachFromOrganizationsOnDelete(app: FastifyInstance, account: AccountState) {
  const instances = await app.consequent.find('organizationMembership', searchCriteria({ tenant: account.tenant, accountId: account.accountId }))
  const memberships = instances
    .map((i) => i.state as unknown as OrganizationMembershipState)
    .filter((m) => m.status === 'active')

  for (const membership of memberships) {
    if (membership.roles.includes('manager')) {
      const siblings = await fetchMemberships(app, membership.tenant, membership.organizationId)
      const managers = organizationManagers(siblings)
      const isSoleManager = managers.length === 1 && managers[0]!.membershipId === membership.membershipId
      if (isSoleManager && membership.successorAccountId) {
        const successor = siblings.find((m) => m.accountId === membership.successorAccountId)
        if (successor) {
          await app.consequent.handle(successor.membershipId, 'organizationMembership.grant-role', { role: 'manager' })
        }
      }
    }
    await app.consequent.handle(membership.membershipId, 'organizationMembership.revoke', {})
  }
}

async function patchAccount(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
  const { status } = request.body as { status: 'active' | 'suspended' | 'deleted' }

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

  const command = status === 'active' ? 'account.activate' : status === 'suspended' ? 'account.suspend' : 'account.delete'
  const results = await app.consequent.handle(accountId, command, { actingAs: operatorActor(request) })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  if (status === 'deleted') {
    await detachFromOrganizationsOnDelete(app, current)
  }

  return toResponse(await fetchAccount(app, accountId))
}

async function changeEmail(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
  const { newEmail } = request.body as { newEmail: string }

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) {
    return reply.code(404).send()
  }

  const oldContactId = current.contactId

  // Find-or-create the contact record for the new email's hash -- ADR
  // 0023's existing deterministic-lookup mechanism, the same one invite
  // acceptance already relies on ("inviting an already-known email
  // naturally resolves to the same contact record"). Never creates a
  // duplicate for an email already known to this tenant.
  const newContact = await app.contactStore.upsert(tenantSlug, newEmail)

  if (newContact.id === oldContactId) {
    // Already pointing at this contact -- e.g. a retried request with the
    // same newEmail, or newEmail normalizes to the account's current
    // address. Nothing to repoint, nothing to publish (a migrated event
    // with oldContactId === newContactId would be a confusing no-op for
    // herald's own consumer). Naturally idempotent, matching this design's
    // "retry converges" convention rather than an explicit guard clause.
    return current
  }

  const results = await app.consequent.handle(accountId, 'account.change-email', { contactId: newContact.id, actingAs: operatorActor(request) })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) {
    return reply.code(409).send({ error: rejection.reason?.message })
  }

  // ADR 0024's existing carry-forward mechanism (optOut, and per ADR 0076,
  // suppression), triggered by a real publisher for the first time here --
  // herald's own consumer side was already built against this exact
  // contract (contact-lifecycle-consumer.ts), just never had a caller
  // until now.
  await app.publisher.publish('herald.contact.migrated', {
    tenant: tenantSlug,
    oldContactId,
    newContactId: newContact.id,
  })

  return fetchAccount(app, accountId)
}

async function grantRole(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
  const body = request.body as { name: string, scope: AccountGrantScope }

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

  if (!(await rolesValid(app, tenantSlug, [body]))) {
    return reply.code(400).send({ error: 'role must reference an existing, active role definition for this tenant' })
  }

  // Always `grantedRoles` (permanent) -- this route has no
  // `trialDurationDays` parameter and never touches `trialRoles`.
  // Time-boxed grants only ever arrive via invite/invite-code redemption
  // or keep's entitlement events (ADR 0018).
  await app.consequent.handle(accountId, 'account.grant-role', { role: { name: body.name, scope: body.scope }, actingAs: operatorActor(request) })
  return reply.code(201).send(toResponse(await fetchAccount(app, accountId)))
}

async function revokeRole(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId, name } = request.params as { tenantSlug: string, accountId: string, name: string }
  const query = request.query as { scope?: string, applicationScope?: string }

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

  const role: RoleGrant = { name, scope: scopeFromQuery(query) }
  // Checks both `grantedRoles` and `trialRoles` -- `roleRevoked`'s own
  // event handler already does this (`account_actor.ts`), a role
  // shouldn't simultaneously exist as both for the same (name, scope).
  await app.consequent.handle(accountId, 'account.revoke-role', { role, actingAs: operatorActor(request) })
  return toResponse(await fetchAccount(app, accountId))
}

async function grantPermission(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
  const body = request.body as PermissionGrant

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

  // Story 005: "`grant` must be one of the catalogued values... rejects
  // anything else outright rather than accepting and silently ignoring an
  // unrecognized grant string."
  if (!(PERMISSION_CATALOG as readonly string[]).includes(body.grant)) {
    return reply.code(400).send({ error: `unrecognized permission grant: ${body.grant}` })
  }

  await app.consequent.handle(accountId, 'account.grant-permission', { permission: body, actingAs: operatorActor(request) })
  return reply.code(201).send(toResponse(await fetchAccount(app, accountId)))
}

async function revokePermission(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, accountId, grant } = request.params as { tenantSlug: string, accountId: string, grant: string }
  const query = request.query as { scope?: string, applicationScope?: string }

  const current = await fetchAccount(app, accountId)
  if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

  await app.consequent.handle(accountId, 'account.revoke-permission', { permission: { grant, scope: scopeFromQuery(query) }, actingAs: operatorActor(request) })
  return toResponse(await fetchAccount(app, accountId))
}

const accountRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/accounts',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requirePermission('accounts:manage') },
    (request, reply) => listAccounts(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/accounts/:accountId',
    { schema: { params: accountParamsSchema }, preHandler: requireSelfOrPermission('accounts:manage') },
    (request, reply) => getAccount(app, request, reply),
  )

  app.patch(
    '/tenants/:tenantSlug/accounts/:accountId',
    { schema: { params: accountParamsSchema, body: patchBodySchema }, preHandler: requirePermission('accounts:manage') },
    (request, reply) => patchAccount(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/accounts/:accountId/change-email',
    { schema: { params: accountParamsSchema, body: changeEmailBodySchema }, preHandler: requirePermission('accounts:manage') },
    (request, reply) => changeEmail(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/accounts/:accountId/roles',
    { schema: { params: accountParamsSchema, body: roleBodySchema }, preHandler: requirePermission('roles:manage') },
    (request, reply) => grantRole(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/accounts/:accountId/roles/:name',
    { schema: { params: roleParamsSchema, querystring: removalQuerySchema }, preHandler: requirePermission('roles:manage') },
    (request, reply) => revokeRole(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/accounts/:accountId/permissions',
    { schema: { params: accountParamsSchema, body: permissionBodySchema }, preHandler: requirePermission('permissions:manage') },
    (request, reply) => grantPermission(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/accounts/:accountId/permissions/:grant',
    { schema: { params: permissionParamsSchema, querystring: removalQuerySchema }, preHandler: requirePermission('permissions:manage') },
    (request, reply) => revokePermission(app, request, reply),
  )

  // Story 013: the operator tree -- same handlers, bearer-token auth
  // instead of `permissions`, mutations additionally require
  // `X-Operator-Actor` (`requireOperatorActor`, `400` if missing).
  app.get(
    '/operator/tenants/:tenantSlug/accounts',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => listAccounts(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/accounts/:accountId',
    { schema: { params: accountParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => getAccount(app, request, reply),
  )

  app.patch(
    '/operator/tenants/:tenantSlug/accounts/:accountId',
    { schema: { params: accountParamsSchema, body: patchBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => patchAccount(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/accounts/:accountId/change-email',
    { schema: { params: accountParamsSchema, body: changeEmailBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => changeEmail(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/accounts/:accountId/roles',
    { schema: { params: accountParamsSchema, body: roleBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => grantRole(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/accounts/:accountId/roles/:name',
    { schema: { params: roleParamsSchema, querystring: removalQuerySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => revokeRole(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/accounts/:accountId/permissions',
    { schema: { params: accountParamsSchema, body: permissionBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => grantPermission(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/accounts/:accountId/permissions/:grant',
    { schema: { params: permissionParamsSchema, querystring: removalQuerySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => revokePermission(app, request, reply),
  )
}

export default accountRoutes
