import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { OrganizationState } from '../actors/organization_actor.js'
import type { OrganizationMembershipState } from '../actors/organization_membership_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import { requireOrganizationManager, requireOrganizationMember, requireSelfOrOrganizationManager, requireSelf, requirePermission } from '../lib/permissions.js'
import { requireOperatorAuth, requireOperatorActor } from '../lib/operator-auth.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { organizationRolesValid } from '../lib/role-definition-lookup.js'

// Per design/adrs/0100-organization-membership-and-open-role-catalog.md
// (supersedes ADR 0090/0098's `organization.managers[]`/`.successors` and
// the two-catalog-permission mechanism). Membership -- and standing within
// it -- lives entirely on `organizationMembership` records, one per
// (account, organization) pair; an account can hold any number of them.
// Story 013's operator-tree-wraps-same-handlers pattern (ADR 0030) still
// applies, with the same one exception ADR 0090 already carved out:
// `promote-successor` has no tenant-scoped counterpart -- it's the
// operator-mediated incapacitation/death path, unreachable by any
// self-service caller including an org's own manager.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const organizationParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' } },
} as const

const memberParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' }, accountId: { type: 'string' } },
} as const

const memberRoleParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId', 'accountId', 'role'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' }, accountId: { type: 'string' }, role: { type: 'string' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1 } },
} as const

const addMemberBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId'],
  properties: {
    accountId: { type: 'string', minLength: 1 },
    roles: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const

const grantRoleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role'],
  properties: { role: { type: 'string', minLength: 1 } },
} as const

const successorBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['successorAccountId'],
  properties: { successorAccountId: { type: 'string', minLength: 1 } },
} as const

async function fetchOrganization(app: FastifyInstance, organizationId: string): Promise<OrganizationState> {
  const instance = await app.consequent.fetch('organization', organizationId)
  return instance!.state as unknown as OrganizationState
}

async function fetchAccount(app: FastifyInstance, accountId: string): Promise<AccountState> {
  const instance = await app.consequent.fetch('account', accountId)
  return instance!.state as unknown as AccountState
}

function organizationExists(state: OrganizationState): boolean {
  return Boolean(state.createdAt)
}

function accountExists(state: AccountState): boolean {
  return Boolean(state.createdAt)
}

function toResponse(state: OrganizationState) {
  const { createdAt: _createdAt, ...rest } = state
  return rest
}

function membershipToResponse(state: OrganizationMembershipState) {
  const { createdAt: _createdAt, status: _status, ...rest } = state
  return rest
}

// Active memberships for one organization -- the roster `GET .../members`
// returns, and the pool `guardLastManager`/seat-limit checks count against.
async function fetchMemberships(app: FastifyInstance, tenantSlug: string, organizationId: string): Promise<OrganizationMembershipState[]> {
  const instances = await app.consequent.find('organizationMembership', searchCriteria({ tenant: tenantSlug, organizationId }))
  return instances
    .map((i) => i.state as unknown as OrganizationMembershipState)
    .filter((m) => m.status === 'active')
}

async function findMembership(app: FastifyInstance, tenantSlug: string, organizationId: string, accountId: string): Promise<OrganizationMembershipState | null> {
  const instances = await app.consequent.find('organizationMembership', searchCriteria({ tenant: tenantSlug, organizationId, accountId }))
  const active = instances.map((i) => i.state as unknown as OrganizationMembershipState).find((m) => m.status === 'active')
  return active ?? null
}

function organizationManagers(memberships: OrganizationMembershipState[]): OrganizationMembershipState[] {
  return memberships.filter((m) => m.roles.includes('manager'))
}

// Every membership always includes 'member' (organization_membership_actor.ts's
// own invariant, enforced here at the route layer, not the actor) --
// 'manager'/other org roles are layered on top, never held alone.
function rolesForNewMembership(extra: string[]): string[] {
  const unique = new Set(['member', ...extra])
  return [...unique]
}

// ADR 0100: the same last-manager-with-successor-fallback rule ADR 0090
// originally described, now checked across sibling `organizationMembership`
// records instead of one actor's own `managers[]` array. Called before
// actually removing 'manager' standing from `membership` (whether via a
// role revoke or a full membership revoke) -- a no-op unless `membership`
// is genuinely the organization's *only* active manager.
async function guardLastManager(
  app: FastifyInstance,
  tenantSlug: string,
  organizationId: string,
  membership: OrganizationMembershipState,
): Promise<{ ok: true } | { ok: false, status: number, error: string }> {
  const memberships = await fetchMemberships(app, tenantSlug, organizationId)
  const managers = organizationManagers(memberships)
  const isSoleManager = managers.length === 1 && managers[0]!.membershipId === membership.membershipId
  if (!isSoleManager) return { ok: true }

  if (!membership.successorAccountId) {
    return { ok: false, status: 409, error: 'cannot remove the only remaining manager without a designated successor' }
  }
  const successor = memberships.find((m) => m.accountId === membership.successorAccountId)
  if (!successor) {
    return { ok: false, status: 409, error: 'designated successor is no longer a member of this organization' }
  }
  await app.consequent.handle(successor.membershipId, 'organizationMembership.grant-role', { role: 'manager' })
  await app.publisher.publish('organization.manager-succeeded', {
    organizationId,
    tenant: tenantSlug,
    departingAccountId: membership.accountId,
    successorAccountId: successor.accountId,
  })
  return { ok: true }
}

async function createOrganization(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { name } = request.body as { name: string }

  // Self-service: any authenticated caller can create an organization, no
  // special permission needed. Unlike ADR 0090, an account may already
  // belong to other organizations -- membership is many-to-many now.
  const claims = request.authstar
  if (!(claims?.enrichmentStatus === 'ok' && claims.accountId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const organizationId = app.ids.nextOrganizationId()
  await app.consequent.handle(organizationId, 'organization.create', { organizationId, tenant: tenantSlug, name })
  const membershipId = app.ids.nextOrganizationMembershipId()
  await app.consequent.handle(membershipId, 'organizationMembership.create', {
    membershipId,
    tenant: tenantSlug,
    accountId: claims.accountId,
    organizationId,
    roles: rolesForNewMembership(['manager']),
  })
  return reply.code(201).send(toResponse(await fetchOrganization(app, organizationId)))
}

async function getOrganization(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()
  return toResponse(org)
}

// Tenant-admin only (accounts:manage, same gate listAccounts already uses)
// -- an ordinary member has no legitimate reason to enumerate every other
// organization in the tenant, only the ones they belong to.
async function listOrganizations(app: FastifyInstance, request: FastifyRequest) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const instances = await app.consequent.find('organization', searchCriteria({ tenant: tenantSlug }))
  return instances.map((i) => toResponse(i.state as unknown as OrganizationState))
}

async function listMembers(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const memberships = await fetchMemberships(app, tenantSlug, organizationId)
  return memberships.map(membershipToResponse)
}

// Direct add of an existing account (as opposed to invite-and-redeem,
// routes/invites.ts's `createOrganizationInvite`) -- same seat-limit gate
// as redemption (identities.ts), since this is another path onto the
// roster. `null` seatLimit means one seat, the creator only (ADR 0100).
async function addMember(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const { accountId, roles } = request.body as { accountId: string, roles?: string[] }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const target = await fetchAccount(app, accountId)
  if (!accountExists(target) || target.tenant !== tenantSlug) return reply.code(404).send()

  const existing = await findMembership(app, tenantSlug, organizationId, accountId)
  if (existing) return reply.code(409).send({ error: 'account is already a member of this organization' })

  if (!(await organizationRolesValid(app, tenantSlug, roles))) {
    return reply.code(400).send({ error: 'roles must reference existing, active organization role definitions for this tenant' })
  }

  const memberships = await fetchMemberships(app, tenantSlug, organizationId)
  const seatLimit = org.seatLimit ?? 1
  if (memberships.length >= seatLimit) {
    return reply.code(409).send({ error: 'organization has reached its seat limit' })
  }

  const membershipId = app.ids.nextOrganizationMembershipId()
  await app.consequent.handle(membershipId, 'organizationMembership.create', {
    membershipId,
    tenant: tenantSlug,
    accountId,
    organizationId,
    roles: rolesForNewMembership(roles ?? []),
  })
  return reply.code(201).send(membershipToResponse(await fetchMembershipById(app, membershipId)))
}

async function fetchMembershipById(app: FastifyInstance, id: string): Promise<OrganizationMembershipState> {
  const instance = await app.consequent.fetch('organizationMembership', id)
  return instance!.state as unknown as OrganizationMembershipState
}

async function grantRole(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }
  const { role } = request.body as { role: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership) return reply.code(404).send({ error: 'account is not a member of this organization' })

  if (!(await organizationRolesValid(app, tenantSlug, [role]))) {
    return reply.code(400).send({ error: 'role must reference an existing, active organization role definition for this tenant' })
  }

  await app.consequent.handle(membership.membershipId, 'organizationMembership.grant-role', { role })
  return membershipToResponse(await fetchMembershipById(app, membership.membershipId))
}

async function revokeRole(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId, role } = request.params as { tenantSlug: string, organizationId: string, accountId: string, role: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership) return reply.code(404).send({ error: 'account is not a member of this organization' })

  if (role === 'manager') {
    const guard = await guardLastManager(app, tenantSlug, organizationId, membership)
    if (!guard.ok) return reply.code(guard.status).send({ error: guard.error })
  }

  await app.consequent.handle(membership.membershipId, 'organizationMembership.revoke-role', { role })
  return membershipToResponse(await fetchMembershipById(app, membership.membershipId))
}

async function removeMember(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership) return reply.code(404).send()

  if (membership.roles.includes('manager')) {
    const guard = await guardLastManager(app, tenantSlug, organizationId, membership)
    if (!guard.ok) return reply.code(guard.status).send({ error: guard.error })
  }

  await app.consequent.handle(membership.membershipId, 'organizationMembership.revoke', {})
  return reply.code(204).send()
}

async function setSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }
  const { successorAccountId } = request.body as { successorAccountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership) return reply.code(404).send()

  const successor = await findMembership(app, tenantSlug, organizationId, successorAccountId)
  if (!successor) {
    return reply.code(409).send({ error: 'successor must already be a member of this organization' })
  }

  const results = await app.consequent.handle(membership.membershipId, 'organizationMembership.set-successor', { successorAccountId })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  return membershipToResponse(await fetchMembershipById(app, membership.membershipId))
}

async function clearSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership) return reply.code(404).send()

  await app.consequent.handle(membership.membershipId, 'organizationMembership.clear-successor', {})
  return membershipToResponse(await fetchMembershipById(app, membership.membershipId))
}

// Operator-only (ADR 0090's incapacitation/death path, carried over
// unchanged) -- no request body, deliberately: the successor is already
// pre-designated, the operator's only job is identifying which manager is
// being succeeded (the URL) after verifying, out-of-band, that succession
// is actually warranted. Unlike `guardLastManager`, this works on *any*
// manager, not only a sole remaining one -- incapacitation targets a
// specific person regardless of how many co-managers remain, and the
// departing membership keeps its plain 'member' standing rather than being
// fully revoked.
async function promoteSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const membership = await findMembership(app, tenantSlug, organizationId, accountId)
  if (!membership || !membership.roles.includes('manager')) {
    return reply.code(409).send({ error: 'account is not an active manager of this organization' })
  }
  if (!membership.successorAccountId) {
    return reply.code(409).send({ error: 'no successor designated' })
  }
  const successor = await findMembership(app, tenantSlug, organizationId, membership.successorAccountId)
  if (!successor) {
    return reply.code(409).send({ error: 'designated successor is no longer a member of this organization' })
  }

  await app.consequent.handle(successor.membershipId, 'organizationMembership.grant-role', { role: 'manager' })
  await app.consequent.handle(membership.membershipId, 'organizationMembership.revoke-role', { role: 'manager' })
  await app.consequent.handle(membership.membershipId, 'organizationMembership.clear-successor', {})
  await app.publisher.publish('organization.manager-succeeded', {
    organizationId,
    tenant: tenantSlug,
    departingAccountId: accountId,
    successorAccountId: successor.accountId,
  })
  return membershipToResponse(await fetchMembershipById(app, successor.membershipId))
}

const organizationRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/tenants/:tenantSlug/organizations',
    { schema: { params: tenantParamsSchema, body: createBodySchema } },
    (request, reply) => createOrganization(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/organizations',
    { schema: { params: tenantParamsSchema }, preHandler: requirePermission('accounts:manage') },
    (request) => listOrganizations(app, request),
  )

  app.get(
    '/tenants/:tenantSlug/organizations/:organizationId',
    { schema: { params: organizationParamsSchema }, preHandler: requireOrganizationMember() },
    (request, reply) => getOrganization(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/organizations/:organizationId/members',
    { schema: { params: organizationParamsSchema }, preHandler: requireOrganizationMember() },
    (request, reply) => listMembers(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/members',
    { schema: { params: organizationParamsSchema, body: addMemberBodySchema }, preHandler: requireOrganizationManager() },
    (request, reply) => addMember(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/roles',
    { schema: { params: memberParamsSchema, body: grantRoleBodySchema }, preHandler: requireOrganizationManager() },
    (request, reply) => grantRole(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/roles/:role',
    { schema: { params: memberRoleParamsSchema }, preHandler: requireOrganizationManager() },
    (request, reply) => revokeRole(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId',
    { schema: { params: memberParamsSchema }, preHandler: requireSelfOrOrganizationManager() },
    (request, reply) => removeMember(app, request, reply),
  )

  app.put(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/successor',
    { schema: { params: memberParamsSchema, body: successorBodySchema }, preHandler: requireSelf() },
    (request, reply) => setSuccessor(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/successor',
    { schema: { params: memberParamsSchema }, preHandler: requireSelf() },
    (request, reply) => clearSuccessor(app, request, reply),
  )

  // Operator-only -- ADR 0090's incapacitation/death path. Deliberately no
  // tenant-scoped counterpart: not even an org's own manager can invoke
  // this for themselves or a peer, since that would defeat the entire
  // point of requiring out-of-band human verification first.
  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/promote-successor',
    { schema: { params: memberParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => promoteSuccessor(app, request, reply),
  )

  // Operator tree for the rest -- same handlers, bearer-token auth instead
  // of the org-manager/self checks (ADR 0030's "operator tree wraps the
  // same route handlers" pattern, Story 013).
  app.post(
    '/operator/tenants/:tenantSlug/organizations',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => createOrganization(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/organizations',
    { schema: { params: tenantParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request) => listOrganizations(app, request),
  )

  app.get(
    '/operator/tenants/:tenantSlug/organizations/:organizationId',
    { schema: { params: organizationParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => getOrganization(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members',
    { schema: { params: organizationParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => listMembers(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members',
    { schema: { params: organizationParamsSchema, body: addMemberBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => addMember(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/roles',
    { schema: { params: memberParamsSchema, body: grantRoleBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => grantRole(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/roles/:role',
    { schema: { params: memberRoleParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => revokeRole(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId',
    { schema: { params: memberParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => removeMember(app, request, reply),
  )

  app.put(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/successor',
    { schema: { params: memberParamsSchema, body: successorBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => setSuccessor(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId/successor',
    { schema: { params: memberParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => clearSuccessor(app, request, reply),
  )
}

export default organizationRoutes

export { fetchMemberships, findMembership, organizationManagers, guardLastManager, rolesForNewMembership }
