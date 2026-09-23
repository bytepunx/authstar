// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/003-communication-types-and-templates.md.

export interface CommunicationTypeState {
  key: string
  type: string
  tenant: string
  category: 'transactional' | 'marketing'
  retentionDays: number
  status: 'active' | 'deprecated'
}

interface CreateCommand {
  type: string
  tenant: string
  category?: 'transactional' | 'marketing'
  retentionDays?: number
}

interface UpdateCommand {
  category?: 'transactional' | 'marketing'
  retentionDays?: number
}

// `type` is the unambiguous "does this key already have a row" signal --
// empty only for a communicationType that was never created (consequent's
// fetch of a never-created actor returns the module's own default state,
// same convention tower's `tenant_actor.ts` established with `createdAt`).
function exists(state: CommunicationTypeState): boolean {
  return Boolean(state.type)
}

// IMPORTANT: a *command* `then` handler's first parameter is the full
// `ActorInstance` wrapper (`{ actor, state, commands, events }`), not the
// bare state -- confirmed directly against consequent's own
// `apply.js#processCommand` (`handle(instance, command)`, no unwrapping)
// and verified with a standalone probe actor. This is genuinely different
// from `when` predicates and *event* handlers, which both receive bare
// state (`filterHandlers`' `predicate(instance.state, message)` and
// `apply.js#processEvent`'s `handle(instance.state, event)`, respectively).
// Tower's own pilot never surfaced this because none of its command `then`
// handlers ever read their first argument. Every command handler here that
// needs to inspect current state destructures `.state` explicitly for
// that reason -- never treat a command handler's first parameter as state.
interface Instance { state: CommunicationTypeState }

function create(instance: Instance, command: CreateCommand) {
  // Rejects if the exact key already exists in *either* status -- a
  // deprecated type's `type` string isn't reusable, since historical
  // `communication` records still reference it by that string (Story 003).
  if (exists(instance.state)) {
    return Promise.reject(new Error(`communication type "${command.type}" already exists for this tenant`))
  }
  return {
    type: 'communicationType.created',
    typeName: command.type,
    tenant: command.tenant,
    category: command.category ?? 'transactional',
    retentionDays: command.retentionDays ?? 30,
  }
}

function update(instance: Instance, command: UpdateCommand) {
  if (!exists(instance.state)) {
    return Promise.reject(new Error('communication type not found'))
  }
  return {
    type: 'communicationType.updated',
    category: command.category,
    retentionDays: command.retentionDays,
  }
}

function deprecate(instance: Instance) {
  if (!exists(instance.state)) {
    return Promise.reject(new Error('communication type not found'))
  }
  if (instance.state.status === 'deprecated') {
    return Promise.reject(new Error('communication type is already deprecated'))
  }
  return { type: 'communicationType.deprecated' }
}

function created(state: CommunicationTypeState, event: { typeName: string, tenant: string, category: 'transactional' | 'marketing', retentionDays: number }) {
  state.key = `${event.tenant}:${event.typeName}`
  state.type = event.typeName
  state.tenant = event.tenant
  state.category = event.category
  state.retentionDays = event.retentionDays
  state.status = 'active'
}

function updated(state: CommunicationTypeState, event: { category?: 'transactional' | 'marketing', retentionDays?: number }) {
  if (event.category !== undefined) state.category = event.category
  if (event.retentionDays !== undefined) state.retentionDays = event.retentionDays
}

function deprecated(state: CommunicationTypeState) {
  state.status = 'deprecated'
}

export default function communicationTypeActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'communicationType',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'status'],
    },
    state: {
      key: '',
      type: '',
      tenant: '',
      category: 'transactional',
      retentionDays: 30,
      status: 'active',
    },
    commands: {
      create,
      update,
      deprecate,
    },
    events: {
      created,
      updated,
      deprecated,
    },
  }
}
