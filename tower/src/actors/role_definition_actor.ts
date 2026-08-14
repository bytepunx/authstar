// Per design/decisions/0047-application-and-role-slug-validation.md and
// design/stories/tower/001-actor-definitions.md's `roleDefinition` section
// (which corrected ADR 0047's own original key shape -- see that ADR's own
// 2026-08-05 amendment note).
//
// `identifiedBy: 'key'`, purely positional, no static tags: `${tenant}:
// ${name}` when `scope === 'tenant'`, `${tenant}:${appSlug}:${name}` when
// `scope === {application: appSlug}` -- disambiguated by segment count
// alone, safe because none of `tenant`/`appSlug`/`name` can contain the `:`
// delimiter (same slug character set ADR 0002 established elsewhere), and a
// caller always already knows `scope` from the role grant it's validating,
// so nothing ever needs to parse an ambiguous key back into parts. Callers
// (routes/role-definitions.ts) compute this key themselves before calling
// `consequent.handle(key, 'roleDefinition.create', ...)`.
//
// The composite key **is** the uniqueness constraint (ADR 0047: "validation
// is a direct fetch(), not a find()/search") -- unlike `application` (which
// needs a sibling-slug-uniqueness check against every *other* application
// under the same tenant, requiring `tenant`'s own single-writer queue),
// `roleDefinition`'s own single-writer-per-actor queue on this exact key is
// already sufficient to make "does this name/scope already exist" race-free
// with no parent-actor coordination needed -- see `doesNotExist`'s guard
// below.
export interface RoleDefinitionState {
  tenant: string
  name: string
  scope: 'tenant' | { application: string }
  description: string
  status: 'active' | 'retired'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  name: string
  scope: 'tenant' | { application: string }
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

function retire() {
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
