// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/004-communication-history-opt-outs-and-suppressions.md.
//
// Deliberately distinct from `optOut` -- blanket (every category), system-
// or admin-initiated, exists for deliverability protection, not CAN-SPAM
// consent (Story 001/ADR 0074). Same bare-`contactId`-is-safe reasoning as
// `optOut` -- no composite key needed.
//
// `DELETE /suppressions/{contactId}` is a real removal (Story 004), not the
// no-physical-delete lifecycle-status pattern most actors in this design
// use -- there's exactly one suppression per contactId (identifiedBy
// `contactId`), so "delete the row" and "delete the collection membership"
// are the same operation here. Modeled as a `removed` event that resets
// state back to its all-default shape (so `exists()` reads false again and
// a fresh `create` is legitimately reachable) -- consequent has no physical-
// delete primitive; the underlying event log still remembers this actor
// existed, same as everywhere else in this design, only the *current*
// projected state looks unsuppressed again.

export type SuppressionReason = 'hard-bounce' | 'complaint' | 'manual'

export interface SuppressionState {
  tenant: string
  contactId: string
  reason: SuppressionReason
  createdAt: string
}

interface CreateCommand {
  tenant: string
  contactId: string
  reason: SuppressionReason
}

function exists(state: SuppressionState): boolean {
  return Boolean(state.createdAt)
}

// A command `then` handler's first parameter is the full `ActorInstance`
// wrapper, not bare state -- see the note in `communication_type_actor.ts`.
interface Instance { state: SuppressionState }

function create(instance: Instance, command: CreateCommand) {
  if (exists(instance.state)) {
    return Promise.reject(new Error('contact is already suppressed'))
  }
  return { type: 'suppression.created', tenant: command.tenant, contactId: command.contactId, reason: command.reason }
}

function remove(instance: Instance) {
  if (!exists(instance.state)) {
    return Promise.reject(new Error('no suppression record for this contact'))
  }
  return { type: 'suppression.removed' }
}

function created(state: SuppressionState, event: CreateCommand) {
  state.tenant = event.tenant
  state.contactId = event.contactId
  state.reason = event.reason
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function removed(state: SuppressionState) {
  state.tenant = ''
  state.contactId = ''
  state.reason = 'hard-bounce'
  state.createdAt = ''
}

export default function suppressionActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'suppression',
      identifiedBy: 'contactId',
      searchableBy: ['tenant', 'reason'],
    },
    state: {
      tenant: '',
      contactId: '',
      reason: 'hard-bounce' as SuppressionReason,
      createdAt: '',
    },
    commands: {
      create,
      remove,
    },
    events: {
      created,
      removed,
    },
  }
}
