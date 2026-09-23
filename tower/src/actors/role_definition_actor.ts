// Per design/decisions/0047-application-and-role-slug-validation.md and
// design/stories/tower/001-actor-definitions.md's `roleDefinition` section
// (which corrected ADR 0047's own original key shape -- see that ADR's own
// 2026-08-05 amendment note).
//
// `identifiedBy: 'key'`, purely positional, no static tags: `${tenant}:
// ${name}` when `scope === 'tenant'`, `${tenant}:organization:${name}` when
// `scope === 'organization'` (design/decisions/0100-...), `${tenant}:
// ${appSlug}:${name}` when `scope === {application: appSlug}` --
// disambiguated by segment count alone (the organization case reuses the
// application case's two-segment shape with a literal `organization` where
// an app slug would go -- `applications.ts` rejects `organization` as an
// application slug for exactly this reason, same as it already rejects
// `_admin`), safe because none of `tenant`/`appSlug`/`name` can contain the
// `:` delimiter (same slug character set ADR 0002 established elsewhere), and a
// caller always already knows `scope` from the role grant it's validating,
// so nothing ever needs to parse an ambiguous key back into parts. Callers
// (routes/role-definitions.ts) compute this key themselves before calling
// `consequent.handle(key, 'roleDefinition.create', ...)`.
//
// The composite key **is** the uniqueness constraint (ADR 0047: "validation
// is a direct fetch(), not a find()/search") -- unlike `application` (which
// needs a sibling-slug-uniqueness check against every *other* application
// under the same tenant), no parent-actor coordination is needed here: a
// single `fetch()` against this exact key is enough to know "does this
// name/scope already exist" -- see `doesNotExist`'s guard below.
//
// **That guard alone is not race-free against concurrent creates**,
// despite operating on a single actor id -- confirmed directly against
// `consequent`'s own `dispatch.js`/`manager.js`: `handle()` fetches this
// actor's current state *before* entering its per-actor command queue, so
// two concurrent `handle()` calls for the same key can each see the same
// pre-write (nonexistent) state and both pass this guard, each then
// independently persisting its own `roleDefinition.created` event onto the
// same actor id. `routes/role-definitions.ts`'s own `roleDefinitionMutex`
// (see `src/lib/mutex.ts`) is what actually closes this, serializing
// concurrent creates for the same key at the route layer before either
// ever reaches this command.
export interface RoleDefinitionState {
  tenant: string
  name: string
  scope: 'tenant' | 'organization' | { application: string }
  description: string
  status: 'active' | 'retired'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  name: string
  scope: 'tenant' | 'organization' | { application: string }
  description: string
}

interface UpdateCommand {
  description?: string
}

function doesNotExist(state: RoleDefinitionState) {
  return !state.createdAt
}

function create(_state: RoleDefinitionState, command: CreateCommand) {
  return {
    type: 'roleDefinition.created',
    tenant: command.tenant,
    name: command.name,
    scope: command.scope,
    description: command.description ?? '',
  }
}

function rejectDuplicateCreate() {
  return Promise.reject(new Error('a role definition with this name already exists for this scope'))
}

function update(_state: RoleDefinitionState, command: UpdateCommand) {
  return { type: 'roleDefinition.updated', description: command.description }
}

// A role must have an active `roleDefinition` before it can be granted
// anywhere (ADR 0047) -- retiring never deletes it, existing grants of an
// already-retired role stay intact as historical fact; retiring only blocks
// *future* grants (validated by whatever write path checks the catalog,
// not by this actor itself).
function isActive(state: RoleDefinitionState) {
  return state.status === 'active'
}

// Baked into authstar itself (design/decisions/0100-organization-membership-
// and-scoped-entitlements.md) -- every tenant gets these seeded at
// provisioning time (routes/provisioning.ts) and can define more org-scope
// roles beyond them the same way app-scope ones are defined, but these four
// specifically are never retirable: `manager`/`member` are tower's own
// org-administration primitive (requireOrganizationManager/Member check for
// them directly), `billingAdmin`/`billingViewer` are keep's Billing Portal
// access levels.
const PROTECTED_ORGANIZATION_ROLES = new Set(['manager', 'member', 'billingAdmin', 'billingViewer'])

// design/decisions/0101-api-keys.md: the first *application*-scope (not
// organization/tenant-scope) baked-in role -- authstar interprets this one
// role name as its own access-control primitive (routes/api-keys.ts checks
// for it directly) the same narrow way it already does for the four
// organization roles above, so it gets the same retirement protection.
// Seeded per application at creation time (routes/applications.ts), not
// per tenant at provisioning time.
const PROTECTED_APPLICATION_ROLE_NAMES = new Set(['api-keys:manage'])

// Command `then` handlers for an already-existing actor receive the full
// instance wrapper (`{state, actor, ...}`), not the state alone -- the same
// asymmetry organization_actor.ts's own header comment documents (confirmed
// directly against consequent's `apply.js`). `when` guards (like `isActive`
// above) receive raw state; `then` handlers here do not.
interface ActorInstance {
  state: RoleDefinitionState
}

function retire(instance: ActorInstance) {
  if (instance.state.scope === 'organization' && PROTECTED_ORGANIZATION_ROLES.has(instance.state.name)) {
    return Promise.reject(new Error('this organization role is built into authstar and cannot be retired'))
  }
  if (typeof instance.state.scope === 'object' && PROTECTED_APPLICATION_ROLE_NAMES.has(instance.state.name)) {
    return Promise.reject(new Error('this application role is built into authstar and cannot be retired'))
  }
  return { type: 'roleDefinition.retired' }
}

function rejectRetire() {
  return Promise.reject(new Error('role definition already retired'))
}

function created(state: RoleDefinitionState, event: CreateCommand) {
  state.tenant = event.tenant
  state.name = event.name
  state.scope = event.scope
  state.description = event.description ?? ''
  state.status = 'active'
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(state: RoleDefinitionState, event: { description?: string }) {
  if (event.description !== undefined) state.description = event.description
}

function retired(state: RoleDefinitionState) {
  state.status = 'retired'
}

export default function roleDefinitionActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'roleDefinition',
      identifiedBy: 'key',
      // `scope` is deliberately not searchable -- it's `'tenant' | {application}`,
      // not a flat scalar, and the default in-memory/Postgres search
      // adapters alike only compare flat field values. The list route
      // (`consequent.find('roleDefinition', {tenant})`) filters by
      // scope/status in application code instead, same approach
      // `applications.ts`'s list route already takes for its own
      // status/`_admin` filtering.
      searchableBy: ['tenant', 'status'],
    },
    state: {
      tenant: '',
      name: '',
      scope: 'tenant',
      description: '',
      status: 'active',
      createdAt: '',
    },
    commands: {
      create: [
        { when: doesNotExist, then: create },
        rejectDuplicateCreate,
      ],
      update,
      retire: [
        { when: isActive, then: retire },
        rejectRetire,
      ],
    },
    events: {
      created,
      updated,
      retired,
    },
  }
}
