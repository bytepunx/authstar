import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { OrganizationState } from '../actors/organization_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import { requireOrganizationManager, requireSelfOrOrganizationManager, requireSelf } from '../lib/permissions.js'
import { requireOperatorAuth, requireOperatorActor, operatorActor } from '../lib/operator-auth.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/decisions/0090-organizations-shared-billing-administration-
// and-succession.md. Story 013's operator-tree-wraps-same-handlers
// pattern (ADR 0030) applies here too, with one exception:
// `promote-successor` has no tenant-scoped counterpart at all -- it's the
// operator-mediated incapacitation/death path, deliberately unreachable
// by any self-service caller including an org's own manager (see the
// route registration at the bottom).

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

const managerParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' }, accountId: { type: 'string' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1 } },
} as const

const accountIdBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId'],
  properties: { accountId: { type: 'string', minLength: 1 } },
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

async function createOrganization(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { name } = request.body as { name: string }

  // Self-service: any authenticated caller can create an organization, no
  // special permission needed -- but they may not already belong to one
  // (an account belongs to at most one at a time, ADR 0090).
  const claims = request.authstar
  if (!(claims?.enrichmentStatus === 'ok' && claims.accountId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }
  if (claims.organizationId) {
    return reply.code(409).send({ error: 'account already belongs to an organization' })
  }

  const organizationId = app.ids.nextOrganizationId()
  await app.consequent.handle(organizationId, 'organization.create', { organizationId, tenant: tenantSlug, name, creatorAccountId: claims.accountId })
  await app.consequent.handle(claims.accountId, 'account.join-organization', { organizationId })
  return reply.code(201).send(toResponse(await fetchOrganization(app, organizationId)))
}

async function getOrganization(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()
  return toResponse(org)
}

async function addManager(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
  const { accountId } = request.body as { accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const target = await fetchAccount(app, accountId)
  if (!accountExists(target) || target.organizationId !== organizationId) {
    return reply.code(409).send({ error: 'account is not a member of this organization' })
  }

  await app.consequent.handle(organizationId, 'organization.add-manager', { accountId })
  return toResponse(await fetchOrganization(app, organizationId))
}

async function removeManager(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const results = await app.consequent.handle(organizationId, 'organization.remove-manager', { accountId })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  return toResponse(await fetchOrganization(app, organizationId))
}

async function removeMember(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const target = await fetchAccount(app, accountId)
  if (!accountExists(target) || target.organizationId !== organizationId) return reply.code(404).send()

  // A manager being removed as a member first goes through the same
  // last-manager-with-successor-fallback rule remove-manager enforces --
  // membership can't be pulled out from under that guard by going through
  // this route instead.
  if (org.managers.includes(accountId)) {
    const results = await app.consequent.handle(organizationId, 'organization.remove-manager', { accountId })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  }
  await app.consequent.handle(accountId, 'account.leave-organization', { actingAs: operatorActor(request) })
  return reply.code(204).send()
}

async function setSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }
  const { successorAccountId } = request.body as { successorAccountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const successor = await fetchAccount(app, successorAccountId)
  if (!accountExists(successor) || successor.organizationId !== organizationId) {
    return reply.code(409).send({ error: 'successor must already be a member of this organization' })
  }

  const results = await app.consequent.handle(organizationId, 'organization.set-successor', { accountId, successorAccountId })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  return toResponse(await fetchOrganization(app, organizationId))
}

async function clearSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  await app.consequent.handle(organizationId, 'organization.clear-successor', { accountId })
  return toResponse(await fetchOrganization(app, organizationId))
}

// Operator-only (ADR 0090's incapacitation/death path) -- no request body,
// deliberately: the successor is already pre-designated, the operator's
// only job is identifying which manager is being succeeded (the URL) after
// verifying, out-of-band, that succession is actually warranted.
async function promoteSuccessor(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, accountId } = request.params as { tenantSlug: string, organizationId: string, accountId: string }

  const org = await fetchOrganization(app, organizationId)
  if (!organizationExists(org) || org.tenant !== tenantSlug) return reply.code(404).send()

  const results = await app.consequent.handle(organizationId, 'organization.promote-successor', { accountId })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  return toResponse(await fetchOrganization(app, organizationId))
}

const organizationRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/tenants/:tenantSlug/organizations',
    { schema: { params: tenantParamsSchema, body: createBodySchema } },
    (request, reply) => createOrganization(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/organizations/:organizationId',
    { schema: { params: organizationParamsSchema } },
    (request, reply) => getOrganization(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/managers',
    { schema: { params: organizationParamsSchema, body: accountIdBodySchema }, preHandler: requireOrganizationManager() },
    (request, reply) => addManager(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId',
    { schema: { params: managerParamsSchema }, preHandler: requireSelfOrOrganizationManager() },
    (request, reply) => removeManager(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/members/:accountId',
    { schema: { params: managerParamsSchema }, preHandler: requireOrganizationManager() },
    (request, reply) => removeMember(app, request, reply),
  )

  app.put(
    '/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId/successor',
    { schema: { params: managerParamsSchema, body: successorBodySchema }, preHandler: requireSelf() },
    (request, reply) => setSuccessor(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId/successor',
    { schema: { params: managerParamsSchema }, preHandler: requireSelf() },
    (request, reply) => clearSuccessor(app, request, reply),
  )

  // Operator-only -- ADR 0090's incapacitation/death path. Deliberately no
  // tenant-scoped counterpart: not even an org's own manager can invoke
  // this for themselves or a peer, since that would defeat the entire
  // point of requiring out-of-band human verification first.
  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId/promote-successor',
    { schema: { params: managerParamsSchema }, preHandler: requireOperatorActor(app) },
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
    '/operator/tenants/:tenantSlug/organizations/:organizationId',
    { schema: { params: organizationParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => getOrganization(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/managers',
    { schema: { params: organizationParamsSchema, body: accountIdBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => addManager(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId',
    { schema: { params: managerParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => removeManager(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/members/:accountId',
    { schema: { params: managerParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => removeMember(app, request, reply),
  )

  app.put(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId/successor',
    { schema: { params: managerParamsSchema, body: successorBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => setSuccessor(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/organizations/:organizationId/managers/:accountId/successor',
    { schema: { params: managerParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => clearSuccessor(app, request, reply),
  )
}

export default organizationRoutes
