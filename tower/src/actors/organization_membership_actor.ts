// Per design/decisions/0100-organization-membership-and-open-role-catalog.md
// (supersedes ADR 0090's `account.organizationId`/`organization.managers`/
// `.successors` model). The sole source of truth for "which accounts belong
// to which organizations, with what standing" -- one record per (account,
// organization) pair, never a reverse list kept anywhere else (avoids the
// "two actors independently tracking one relationship" drift this
// codebase's own conventions already warn against, e.g. `identity.accountId`
// vs. `account` never holding a reverse identity list).
//
// `identifiedBy: 'membershipId'`, deliberately NOT `'id'` -- consequent
// reserves a state's own `id` property for its internal bookkeeping
// (distinct from `_id`) and silently overwrites it after every event
// application, regardless of what an actor's own event handlers set it to.
// Every other actor in this codebase already sidesteps this by naming its
// identifying field something else (`organizationId`, `accountId`,
// `token`); this one needs the same treatment.
//
// `roles` is the SAME open, catalog-validated vocabulary app-scoped roles
// already use (`roleDefinition`, scope: 'organization') -- not a closed
// enum. Every membership always includes `'member'`; `'manager'` is layered
// on top for co-managers, never held alone. `billingAdmin`/`billingViewer`
// are independent grants a manager can hand to any member. The route layer
// validates `roles` against the org-scope role-definition catalog before
// dispatching (`rolesValid`, `lib/role-definition-lookup.ts`) -- this actor
// never validates role names itself, same separation every other
// role-holding actor in this codebase already follows.
//
// `status` exists because revoking membership is a real lifecycle
// transition, not a deletion -- `find('organizationMembership', {accountId})`
// callers filter to `status === 'active'` themselves (same "retiring never
// deletes" posture `roleDefinition` already uses).
export interface OrganizationMembershipState {
  membershipId: string
  tenant: string
  accountId: string
  organizationId: string
  roles: string[]
  status: 'active' | 'revoked'
  successorAccountId: string | null
  createdAt: string
}

interface CreateCommand {
  membershipId: string
  tenant: string
  accountId: string
  organizationId: string
  roles: string[]
}

interface RoleCommand {
  role: string
}

interface SetSuccessorCommand {
  successorAccountId: string
}

// See role_definition_actor.ts's own identical comment: command `then`
// handlers for an already-existing actor receive the full instance wrapper
// (`{state, actor, ...}`), not the state alone -- `when` guards receive raw
// state.
interface ActorInstance {
  state: OrganizationMembershipState
}

function doesNotExist(state: OrganizationMembershipState) {
  return !state.createdAt
}

function create(_instance: ActorInstance, command: CreateCommand) {
  return {
    type: 'organizationMembership.created',
    membershipId: command.membershipId,
    tenant: command.tenant,
    accountId: command.accountId,
    organizationId: command.organizationId,
    roles: command.roles,
  }
}

function rejectDuplicateCreate() {
  return Promise.reject(new Error('this account is already a member of this organization'))
}

function isActive(state: OrganizationMembershipState) {
  return state.status === 'active'
}

// Idempotent -- redelivering a grant for a role already held is a no-op,
// same first-write-wins convention `account.roles`/`account.permissions`
// already use.
function grantRole(_instance: ActorInstance, command: RoleCommand) {
  return { type: 'organizationMembership.role-granted', role: command.role }
}

function revokeRole(_instance: ActorInstance, command: RoleCommand) {
  return { type: 'organizationMembership.role-revoked', role: command.role }
}

function setSuccessor(instance: ActorInstance, command: SetSuccessorCommand) {
  if (!instance.state.roles.includes('manager')) {
    return Promise.reject(new Error('only a manager can designate a successor'))
  }
  return { type: 'organizationMembership.successor-set', successorAccountId: command.successorAccountId }
}

function clearSuccessor() {
  return { type: 'organizationMembership.successor-cleared' }
}

function rejectRevoked() {
  return Promise.reject(new Error('membership already revoked'))
}

// Leaves/removes -- the last-manager-with-successor guard this replaces
// (organization_actor.ts's old `removeManager`) needed to inspect every
// *sibling* membership for the same organization, which a single actor
// instance can't do -- that decision now lives at the route layer
// (routes/organizations.ts), which fetches every membership for the org
// before dispatching this.
function revoke() {
  return { type: 'organizationMembership.revoked' }
}

function created(state: OrganizationMembershipState, event: CreateCommand) {
  state.membershipId = event.membershipId
  state.tenant = event.tenant
  state.accountId = event.accountId
  state.organizationId = event.organizationId
  state.roles = event.roles
  state.status = 'active'
  state.successorAccountId = null
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function roleGranted(state: OrganizationMembershipState, event: { role: string }) {
  if (state.roles.includes(event.role)) return
  state.roles = [...state.roles, event.role]
}

function roleRevoked(state: OrganizationMembershipState, event: { role: string }) {
  state.roles = state.roles.filter((r) => r !== event.role)
}

function successorSet(state: OrganizationMembershipState, event: { successorAccountId: string }) {
  state.successorAccountId = event.successorAccountId
}

function successorCleared(state: OrganizationMembershipState) {
  state.successorAccountId = null
}

function revoked(state: OrganizationMembershipState) {
  state.status = 'revoked'
}

export default function organizationMembershipActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'organizationMembership',
      identifiedBy: 'membershipId',
      searchableBy: ['tenant', 'accountId', 'organizationId'],
    },
    state: {
      membershipId: '',
      tenant: '',
      accountId: '',
      organizationId: '',
      roles: [],
      status: 'active',
      successorAccountId: null,
      createdAt: '',
    },
    commands: {
      create: [
        { when: doesNotExist, then: create },
        rejectDuplicateCreate,
      ],
      'grant-role': [
        { when: isActive, then: grantRole },
        rejectRevoked,
      ],
      'revoke-role': [
        { when: isActive, then: revokeRole },
        rejectRevoked,
      ],
      'set-successor': [
        { when: isActive, then: setSuccessor },
        rejectRevoked,
      ],
      'clear-successor': [
        { when: isActive, then: clearSuccessor },
        rejectRevoked,
      ],
      revoke: [
        { when: isActive, then: revoke },
        rejectRevoked,
      ],
    },
    events: {
      created,
      'role-granted': roleGranted,
      'role-revoked': roleRevoked,
      'successor-set': successorSet,
      'successor-cleared': successorCleared,
      revoked,
    },
  }
}
