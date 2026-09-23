// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/004-communication-history-opt-outs-and-suppressions.md.
//
// No composite-key fix needed -- `contactId` is already an HMAC keyed by a
// per-tenant pepper (ADR 0023), cryptographically tenant-differentiated
// without a literal `{tenant}:` prefix (Story 001).

export interface OptOutState {
  tenant: string
  contactId: string
  optedOutCategories: string[]
}

interface AddCategoryCommand {
  tenant: string
  contactId: string
  category: string
}

interface RemoveCategoryCommand {
  category: string
}

function exists(state: OptOutState): boolean {
  return Boolean(state.tenant)
}

// Adding an already-present category is idempotent, not an error -- the
// self-service unsubscribe flow (Story 002) and the support-initiated route
// (Story 004) can both legitimately land on the same category.
function addCategory(_state: OptOutState, command: AddCategoryCommand) {
  return { type: 'optOut.categoryAdded', tenant: command.tenant, contactId: command.contactId, category: command.category }
}

// A command `then` handler's first parameter is the full `ActorInstance`
// wrapper, not bare state -- see the note in `communication_type_actor.ts`.
interface Instance { state: OptOutState }

// Category removal is a collection-membership operation, not a lifecycle
// status change (ADR 0053, Story 001/004) -- confirmed explicitly out of
// scope for the PATCH-alias pattern used elsewhere in this design.
function removeCategory(instance: Instance, command: RemoveCategoryCommand) {
  if (!exists(instance.state)) {
    return Promise.reject(new Error('no opt-out record for this contact'))
  }
  return { type: 'optOut.categoryRemoved', category: command.category }
}

function categoryAdded(state: OptOutState, event: AddCategoryCommand) {
  state.tenant = event.tenant
  state.contactId = event.contactId
  if (!state.optedOutCategories.includes(event.category)) {
    state.optedOutCategories = [...state.optedOutCategories, event.category]
  }
}

function categoryRemoved(state: OptOutState, event: { category: string }) {
  state.optedOutCategories = state.optedOutCategories.filter((c) => c !== event.category)
}

export default function optOutActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'optOut',
      identifiedBy: 'contactId',
      searchableBy: ['tenant'],
    },
    state: {
      tenant: '',
      contactId: '',
      optedOutCategories: [] as string[],
    },
    commands: {
      addCategory,
      removeCategory,
    },
    events: {
      categoryAdded,
      categoryRemoved,
    },
  }
}
