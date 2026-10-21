import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import type { OrganizationState } from '../actors/organization_actor.js'
import type { ApiKeyState } from '../actors/api_key_actor.js'
import { requireAppRole, requireOrganizationManager } from '../lib/permissions.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { filterRolesForApplication } from '../lib/roles.js'
import { generateApiKeySecret, generateApiKeySalt, hashApiKeySecret } from '../lib/api-key-secret.js'

// Per design/adrs/0101-api-keys.md. Two route trees over one shared
// handler core -- personal (an account's own keys for one application) and
// organization (an org's keys for one application, manager-gated). Both
// resolve to the same `ApiKeyState` shape and the same `OwnerContext`
// resolution step; only how the caller/owner is identified and authorized
// differs (`resolvePersonalOwnerContext` vs. `resolveOrganizationOwnerContext`).
//
// No `GET/{apiKeyId}` or `PATCH` route exists, deliberately -- the story
// text is "cannot be edited after creation for now," and a single key's
// detail is never more than what its owner already sees in the list
// response (no secret is ever returned again after creation).

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const personalCollectionParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'appSlug'],
  properties: { tenantSlug: { type: 'string' }, appSlug: { type: 'string' } },
} as const

const personalItemParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'appSlug', 'apiKeyId'],
  properties: { tenantSlug: { type: 'string' }, appSlug: { type: 'string' }, apiKeyId: { type: 'string' } },
} as const

const organizationCollectionParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId', 'appSlug'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' }, appSlug: { type: 'string' } },
} as const

const organizationItemParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId', 'appSlug', 'apiKeyId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' }, appSlug: { type: 'string' }, apiKeyId: { type: 'string' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'grantedRoles'],
  properties: {
    name: { type: 'string', minLength: 1 },
    grantedRoles: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
  },
} as const

interface CreateBody {
  name: string
  grantedRoles: string[]
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function fetchApplication(app: FastifyInstance, tenantSlug: string, appSlug: string): Promise<ApplicationState | null> {
  const instance = await app.consequent.fetch('application', `${tenantSlug}:${appSlug}`)
  const state = instance?.state as unknown as ApplicationState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

async function fetchApiKey(app: FastifyInstance, tenantSlug: string, appSlug: string, apiKeyId: string): Promise<ApiKeyState | null> {
  const instance = await app.consequent.fetch('apiKey', apiKeyId)
  const state = instance?.state as unknown as ApiKeyState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug || state.application !== appSlug) return null
  return state
}

// The subset of an owner's world this route family needs to enforce a
// create -- which application-scoped roles the owner currently holds
// (the ceiling `grantedRoles` is validated against), and the plan-mapping-
// sourced count limit (`null` = unlimited, matching `seatLimit`'s own
// meaning; `0`, the fail-closed default, blocks creation outright).
interface OwnerContext {
  owner: { account: string } | { organization: string }
  ownerAccountId: string | null
  ownerOrganizationId: string | null
  currentRoles: string[]
  limit: number | null
}

async function resolvePersonalOwnerContext(app: FastifyInstance, accountId: string, appSlug: string): Promise<OwnerContext | null> {
  const instance = await app.consequent.fetch('account', accountId)
  const state = instance?.state as unknown as AccountState | undefined
  if (!state?.createdAt) return null
  return {
    owner: { account: accountId },
    ownerAccountId: accountId,
    ownerOrganizationId: null,
    currentRoles: filterRolesForApplication(state.grantedRoles, appSlug),
    limit: state.apiKeyLimit,
  }
}

// `organization.grantedRoles` is `{application, role}[]` (organization_actor.ts),
// not the `{name, scope}` shape `filterRolesForApplication` was written for
// (account's own `grantedRoles`) -- a direct filter+map here rather than a
// shared helper, since the two owner kinds' underlying storage genuinely
// differ (see api_key_actor.ts's own header comment on this same point).
async function resolveOrganizationOwnerContext(app: FastifyInstance, organizationId: string, tenantSlug: string, appSlug: string): Promise<OwnerContext | null> {
  const instance = await app.consequent.fetch('organization', organizationId)
  const state = instance?.state as unknown as OrganizationState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return {
    owner: { organization: organizationId },
    ownerAccountId: null,
    ownerOrganizationId: organizationId,
    currentRoles: state.grantedRoles.filter((r) => r.application === appSlug).map((r) => r.role),
    limit: state.apiKeyLimit,
  }
}

function toResponse(state: ApiKeyState) {
  return {
    apiKeyId: state.apiKeyId,
    tenant: state.tenant,
    application: state.application,
    name: state.name,
    owner: state.owner,
    grantedRoles: state.grantedRoles,
    createdBy: state.createdBy,
    secretPreview: state.secretPreview,
    status: state.status,
    createdAt: state.createdAt,
  }
}

async function listOwnerKeys(app: FastifyInstance, tenantSlug: string, appSlug: string, ownerField: 'ownerAccountId' | 'ownerOrganizationId', ownerId: string) {
  const instances = await app.consequent.find('apiKey', searchCriteria({ tenant: tenantSlug, application: appSlug, [ownerField]: ownerId }))
  return instances.map((i) => i.state as unknown as ApiKeyState).map(toResponse)
}

// Shared create core -- `ownerContext.limit === 0` (the fail-closed default
// every owner starts at, account_actor.ts/organization_actor.ts) blocks
// creation outright: `existing.length (>= 0) >= 0` is always true, so no
// key can ever be created until a real plan-mapping grant raises the limit.
// `limit === null` means unlimited (skips the count check entirely),
// matching `seatLimit`'s own convention.
async function createApiKey(app: FastifyInstance, reply: FastifyReply, tenantSlug: string, appSlug: string, ownerContext: OwnerContext, createdBy: string, body: CreateBody) {
  const invalidRole = body.grantedRoles.find((r) => !ownerContext.currentRoles.includes(r))
  if (invalidRole) {
    return reply.code(400).send({ error: `cannot grant "${invalidRole}" -- not currently held for this application` })
  }

  if (ownerContext.limit !== null) {
    const ownerField = ownerContext.ownerAccountId ? 'ownerAccountId' : 'ownerOrganizationId'
    const ownerId = (ownerContext.ownerAccountId ?? ownerContext.ownerOrganizationId)!
    const existing = await app.consequent.find('apiKey', searchCriteria({ tenant: tenantSlug, application: appSlug, [ownerField]: ownerId, status: 'active' }))
    if (existing.length >= ownerContext.limit) {
      return reply.code(409).send({ error: `already at your apiKeyLimit (${ownerContext.limit}) for this application` })
    }
  }

  const apiKeyId = app.ids.nextApiKeyId()
  const secret = generateApiKeySecret()
  const salt = generateApiKeySalt()
  const hashedSecret = hashApiKeySecret(secret, salt)
  const secretPreview = secret.slice(-4)

  const results = await app.consequent.handle(apiKeyId, 'apiKey.create', {
    apiKeyId,
    tenant: tenantSlug,
    application: appSlug,
    name: body.name,
    owner: ownerContext.owner,
    grantedRoles: body.grantedRoles,
    createdBy,
    hashedSecret,
    salt,
    secretPreview,
  })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  const created = await fetchApiKey(app, tenantSlug, appSlug, apiKeyId)
  // The one and only time `secret` is ever returned -- `toResponse` (used
  // by every list/list-after-revoke path) never includes it.
  return reply.code(201).send({ ...toResponse(created!), secret: `authstar_${apiKeyId}_${secret}` })
}

async function revokeOwnerKey(app: FastifyInstance, reply: FastifyReply, tenantSlug: string, appSlug: string, apiKeyId: string, ownerField: 'ownerAccountId' | 'ownerOrganizationId', ownerId: string) {
  const current = await fetchApiKey(app, tenantSlug, appSlug, apiKeyId)
  if (!current || current[ownerField] !== ownerId) return reply.code(404).send()

  if (current.status === 'revoked') {
    // Retry converges rather than erroring, same convention `applications.ts`'s
    // own soft-delete alias uses.
    return toResponse(current)
  }

  const results = await app.consequent.handle(apiKeyId, 'apiKey.revoke', {})
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  const updated = await fetchApiKey(app, tenantSlug, appSlug, apiKeyId)
  return toResponse(updated!)
}

// design/adrs/0101-api-keys.md: an org-owned key additionally requires
// the org itself to currently hold `api-keys:manage` for this application
// -- `requireOrganizationManager` alone only proves the caller is a manager
// *of the org*, not that the org's own plan entitles it to mint keys at
// all. Composed as a second `preHandler` after `requireOrganizationManager`
// on every org route below (Fastify runs `preHandler` arrays in order,
// short-circuiting on the first reply already sent).
function requireOrganizationHasAppRole(roleName: string): preHandlerHookHandler {
  return async (request, reply) => {
    const { organizationId, appSlug } = request.params as { organizationId: string, appSlug: string }
    const instance = await request.server.consequent.fetch('organization', organizationId)
    const state = instance?.state as unknown as OrganizationState | undefined
    const hasRole = state?.grantedRoles.some((r) => r.application === appSlug && r.role === roleName) ?? false
    if (!hasRole) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

async function createPersonalApiKey(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
  const body = request.body as CreateBody

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()
  if (!(await fetchApplication(app, tenantSlug, appSlug))) return reply.code(404).send()

  // `requireAppRole` already established `enrichmentStatus === 'ok'` and a
  // present `accountId` -- safe to assume non-null here.
  const accountId = request.authstar!.accountId!
  const ownerContext = await resolvePersonalOwnerContext(app, accountId, appSlug)
  if (!ownerContext) return reply.code(404).send()

  return createApiKey(app, reply, tenantSlug, appSlug, ownerContext, accountId, body)
}

async function listPersonalApiKeys(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  const accountId = request.authstar!.accountId!
  return listOwnerKeys(app, tenantSlug, appSlug, 'ownerAccountId', accountId)
}

async function revokePersonalApiKey(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, appSlug, apiKeyId } = request.params as { tenantSlug: string, appSlug: string, apiKeyId: string }
  const accountId = request.authstar!.accountId!
  return revokeOwnerKey(app, reply, tenantSlug, appSlug, apiKeyId, 'ownerAccountId', accountId)
}

async function createOrganizationApiKey(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, appSlug } = request.params as { tenantSlug: string, organizationId: string, appSlug: string }
  const body = request.body as CreateBody

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()
  if (!(await fetchApplication(app, tenantSlug, appSlug))) return reply.code(404).send()

  const ownerContext = await resolveOrganizationOwnerContext(app, organizationId, tenantSlug, appSlug)
  if (!ownerContext) return reply.code(404).send()

  const createdBy = request.authstar?.accountId ?? ''
  return createApiKey(app, reply, tenantSlug, appSlug, ownerContext, createdBy, body)
}

async function listOrganizationApiKeys(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, appSlug } = request.params as { tenantSlug: string, organizationId: string, appSlug: string }
  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  return listOwnerKeys(app, tenantSlug, appSlug, 'ownerOrganizationId', organizationId)
}

async function revokeOrganizationApiKey(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, organizationId, appSlug, apiKeyId } = request.params as { tenantSlug: string, organizationId: string, appSlug: string, apiKeyId: string }
  return revokeOwnerKey(app, reply, tenantSlug, appSlug, apiKeyId, 'ownerOrganizationId', organizationId)
}

const apiKeysRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  // Personal keys -- an account's own keys for one application it holds
  // `api-keys:manage` for.
  app.post(
    '/tenants/:tenantSlug/applications/:appSlug/api-keys',
    { schema: { params: personalCollectionParamsSchema, body: createBodySchema }, preHandler: requireAppRole('api-keys:manage') },
    (request, reply) => createPersonalApiKey(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/applications/:appSlug/api-keys',
    { schema: { params: personalCollectionParamsSchema }, preHandler: requireAppRole('api-keys:manage') },
    (request, reply) => listPersonalApiKeys(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/applications/:appSlug/api-keys/:apiKeyId',
    { schema: { params: personalItemParamsSchema }, preHandler: requireAppRole('api-keys:manage') },
    (request, reply) => revokePersonalApiKey(app, request, reply),
  )

  // Organization keys -- gated on both being a manager of the organization
  // *and* the organization itself currently holding `api-keys:manage` for
  // this application (a manager's own personal roles are irrelevant here).
  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/applications/:appSlug/api-keys',
    {
      schema: { params: organizationCollectionParamsSchema, body: createBodySchema },
      preHandler: [requireOrganizationManager('organizationId'), requireOrganizationHasAppRole('api-keys:manage')],
    },
    (request, reply) => createOrganizationApiKey(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/organizations/:organizationId/applications/:appSlug/api-keys',
    {
      schema: { params: organizationCollectionParamsSchema },
      preHandler: [requireOrganizationManager('organizationId'), requireOrganizationHasAppRole('api-keys:manage')],
    },
    (request, reply) => listOrganizationApiKeys(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/organizations/:organizationId/applications/:appSlug/api-keys/:apiKeyId',
    {
      schema: { params: organizationItemParamsSchema },
      preHandler: [requireOrganizationManager('organizationId'), requireOrganizationHasAppRole('api-keys:manage')],
    },
    (request, reply) => revokeOrganizationApiKey(app, request, reply),
  )
}

export default apiKeysRoutes
