// Per design/decisions/0090-organizations-shared-billing-administration-and-succession.md.
// The missing tier between `account` (single-person, ADR 0017) and `tenant`
// -- a B2B customer's own shared-billing group. Membership itself is
// tracked on `account.organizationId` (a pointer), not a reverse list on
// this actor -- same reasoning `identity.accountId` already uses instead of
// `account` holding a list of identity ids (ADR 0017): avoids two actors
// each keeping their own copy of one relationship that could drift out of
// sync. This actor only ever holds what's genuinely its own state: who
// manages it, and each manager's own designated successor.
export interface OrganizationState {
  organizationId: string
  tenant: string
  name: string
  managers: string[]
  // Keyed by the departing manager's own accountId -- each manager
  // designates their own successor (not one shared successor for the
  // whole org), so if one of several co-managers is incapacitated, only
  // their seat is replaced, not the whole board. See ADR 0090's own
  // "Succession" section for the full reasoning.
  successors: Record<string, string>
  createdAt: string
}

interface CreateCommand {
  organizationId: string
  tenant: string
  name: string
  creatorAccountId: string
}

interface AddManagerCommand {
  accountId: string
}

interface RemoveManagerCommand {
  accountId: string
}

interface SetSuccessorCommand {
  accountId: string
  successorAccountId: string
}

interface ClearSuccessorCommand {
  accountId: string
}

interface PromoteSuccessorCommand {
  accountId: string
}

interface ForceRemoveManagerCommand {
  accountId: string
}

// consequent's own command/event handler asymmetry (confirmed directly
// against its source, apply.js): *event* handlers receive `instance.state`
// directly, but *command* handlers receive the full instance wrapper
// (`{state, actor, ...}`), not the state alone -- every existing command
// in this codebase's other actors happens to never read its own first
// argument (account_actor.ts's grantRole/revokeRole/etc. all prefix it
// `_account`, unused), which silently hid this asymmetry until a command
// that actually needs to read current state (this actor's remove-manager/
// set-successor/promote-successor) hit it directly: reading state fields
// off the wrapper itself (`org.managers` instead of `org.state.managers`)
// throws synchronously, which a real bug in the `haberdasher` queue
// dependency (a rejected queued task never settles its deferred promise)
// turns into a permanent hang rather than a clean rejection -- confirmed
// live via a standalone repro script bypassing Fastify entirely.
interface ActorInstance {
  state: OrganizationState
}

function create(_instance: ActorInstance, command: CreateCommand) {
  return {
    type: 'organization.created',
    organizationId: command.organizationId,
    tenant: command.tenant,
    name: command.name,
    creatorAccountId: command.creatorAccountId,
  }
}

// Idempotent (set-membership, same convention as account.grant-role) --
// the route layer is responsible for confirming `accountId` is already an
// org member before dispatching this (cross-actor validation happens
// before dispatch in this codebase, never inside a consequent command --
// see account_actor.ts's own grant-role/revoke-role for the same
// separation of concerns).
function addManager(_instance: ActorInstance, command: AddManagerCommand) {
  return { type: 'organization.manager-added', accountId: command.accountId }
}

// Targets either a peer or the caller's own account (voluntary departure)
// -- no distinction at this layer, since the org-continuity concern is the
// same either way. Removing one co-manager out of several is a plain
// removal; removing the *sole* remaining manager only succeeds if they've
// designated a successor, in which case this becomes a succession instead
// of a removal (the same `manager-succeeded` transition `promote-successor`
// produces, just reached via a different, self-service-safe trigger).
function removeManager(instance: ActorInstance, command: RemoveManagerCommand) {
  const org = instance.state
  if (!org.managers.includes(command.accountId)) {
    // Idempotent no-op -- matches account_actor's roleRevoked tolerance
    // for a redelivered/duplicate removal of something already gone.
    return { type: 'organization.manager-removed', accountId: command.accountId }
  }
  if (org.managers.length === 1) {
    const successorAccountId = org.successors[command.accountId]
    if (successorAccountId) {
      return { type: 'organization.manager-succeeded', departingAccountId: command.accountId, successorAccountId }
    }
    return Promise.reject(new Error('cannot remove the only remaining manager without a designated successor'))
  }
  return { type: 'organization.manager-removed', accountId: command.accountId }
}

// Always operates on the caller's own entry -- the route layer passes the
// caller's own accountId, never lets one manager set another's successor.
// Rejects if `accountId` isn't currently a manager (setting a successor
// for someone who isn't one is meaningless, not a redelivery-tolerance
// case). The route layer additionally confirms the successor is already
// an org member before dispatching -- cross-actor validation, not this
// actor's concern.
function setSuccessor(instance: ActorInstance, command: SetSuccessorCommand) {
  if (!instance.state.managers.includes(command.accountId)) {
    return Promise.reject(new Error('accountId is not a manager of this organization'))
  }
  return { type: 'organization.successor-set', accountId: command.accountId, successorAccountId: command.successorAccountId }
}

// Idempotent -- clearing an already-absent designation is harmless, no
// guard needed.
function clearSuccessor(_instance: ActorInstance, command: ClearSuccessorCommand) {
  return { type: 'organization.successor-cleared', accountId: command.accountId }
}

// The operator-mediated path (ADR 0090): incapacitation/death can't be
// verified by software, so an authstar operator calls this after an
// out-of-band human verification process -- with no argument identifying
// the successor, since it's already pre-designated. `accountId` here
// identifies which manager is being succeeded; the command resolves their
// designated successor internally. Unlike `removeManager`'s auto-promotion
// branch, this works on *any* manager, not only a sole remaining one --
// incapacitation targets a specific person, regardless of how many
// co-managers remain.
function promoteSuccessor(instance: ActorInstance, command: PromoteSuccessorCommand) {
  const org = instance.state
  if (!org.managers.includes(command.accountId)) {
    return Promise.reject(new Error('accountId is not a manager of this organization'))
  }
  const successorAccountId = org.successors[command.accountId]
  if (!successorAccountId) {
    return Promise.reject(new Error('no successor designated for this manager'))
  }
  return { type: 'organization.manager-succeeded', departingAccountId: command.accountId, successorAccountId }
}

// Internal-only -- never exposed via any HTTP route, dispatched solely by
// the account-deletion cascade (routes/accounts.ts) when a deleted
// account was the sole manager with no successor designated. Unlike
// `removeManager`, this never rejects: a deleted account can't
// meaningfully remain listed as a manager just because removing them
// would otherwise leave the organization manager-less -- ADR 0090's own
// wording is explicit that this is the correct outcome ("the organization
// is left with zero managers... requiring operator intervention"), not a
// dangling reference to an account that no longer exists.
function forceRemoveManager(_instance: ActorInstance, command: ForceRemoveManagerCommand) {
  return { type: 'organization.manager-removed', accountId: command.accountId }
}

function created(org: OrganizationState, event: CreateCommand) {
  org.organizationId = event.organizationId
  org.tenant = event.tenant
  org.name = event.name
  org.managers = [event.creatorAccountId]
  org.successors = {}
  org.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function managerAdded(org: OrganizationState, event: { accountId: string }) {
  if (org.managers.includes(event.accountId)) return
  org.managers = [...org.managers, event.accountId]
}

function managerRemoved(org: OrganizationState, event: { accountId: string }) {
  org.managers = org.managers.filter((m) => m !== event.accountId)
  const { [event.accountId]: _removed, ...rest } = org.successors
  org.successors = rest
}

function managerSucceeded(org: OrganizationState, event: { departingAccountId: string, successorAccountId: string }) {
  const withoutDeparting = org.managers.filter((m) => m !== event.departingAccountId)
  org.managers = withoutDeparting.includes(event.successorAccountId) ? withoutDeparting : [...withoutDeparting, event.successorAccountId]
  const { [event.departingAccountId]: _removed, ...rest } = org.successors
  org.successors = rest
}

function successorSet(org: OrganizationState, event: { accountId: string, successorAccountId: string }) {
  org.successors = { ...org.successors, [event.accountId]: event.successorAccountId }
}

function successorCleared(org: OrganizationState, event: { accountId: string }) {
  const { [event.accountId]: _removed, ...rest } = org.successors
  org.successors = rest
}

export default function organizationActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'organization',
      identifiedBy: 'organizationId',
      searchableBy: ['tenant'],
    },
    state: {
      organizationId: '',
      tenant: '',
      name: '',
      managers: [],
      successors: {},
      createdAt: '',
    },
    commands: {
      create,
      'add-manager': addManager,
      'remove-manager': removeManager,
      'force-remove-manager': forceRemoveManager,
      'set-successor': setSuccessor,
      'clear-successor': clearSuccessor,
      'promote-successor': promoteSuccessor,
    },
    events: {
      created,
      'manager-added': managerAdded,
      'manager-removed': managerRemoved,
      'manager-succeeded': managerSucceeded,
      'successor-set': successorSet,
      'successor-cleared': successorCleared,
    },
  }
}
