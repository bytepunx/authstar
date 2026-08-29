// Per design/decisions/0100-organization-membership-and-scoped-entitlements.md
// (supersedes ADR 0090's original shape). The organization itself, stripped
// down to what's genuinely its own: identity, and what its subscription
// grants. Membership (`managers`/`successors` used to live here) moved to
// its own actor, `organization_membership_actor.ts` -- one record per
// (account, organization) pair, not a reverse list kept here that could
// drift out of sync with each account's own view.
//
// `grantedRoles`/`seatLimit` are populated only by keep's entitlement
// events (`entitlement.role-granted`/`-revoked`/`entitlement.seat-limit-
// changed` for `{organization}` scope, consumed in `lib/entitlement-
// consumer.ts`) -- never by any route in this file directly. This is the
// direct, no-fan-out replacement for ADR 0098's now-superseded mechanism of
// merging org-derived roles onto individual managers' own `account.roles`.
export interface OrganizationState {
  organizationId: string
  tenant: string
  name: string
  grantedRoles: GrantedRole[]
  seatLimit: number | null
  createdAt: string
}

export interface GrantedRole {
  application: string
  role: string
}

interface CreateCommand {
  organizationId: string
  tenant: string
  name: string
}

interface GrantRoleCommand {
  role: GrantedRole
}

interface RevokeRoleCommand {
  role: GrantedRole
}

interface SetSeatLimitCommand {
  seatLimit: number | null
}

function create(_state: OrganizationState, command: CreateCommand) {
  return {
    type: 'organization.created',
    organizationId: command.organizationId,
    tenant: command.tenant,
    name: command.name,
  }
}

function sameGrantedRole(a: GrantedRole, b: GrantedRole): boolean {
  return a.application === b.application && a.role === b.role
}

// Idempotent -- same first-write-wins convention `account.roles` already
// uses. No `when` guard: an organization always exists by the time keep's
// entitlement consumer reaches it (its subscription/customer record can
// only exist for a real organization in the first place).
function grantRole(_state: OrganizationState, command: GrantRoleCommand) {
  return { type: 'organization.role-granted', role: command.role }
}

function revokeRole(_state: OrganizationState, command: RevokeRoleCommand) {
  return { type: 'organization.role-revoked', role: command.role }
}

function setSeatLimit(_state: OrganizationState, command: SetSeatLimitCommand) {
  return { type: 'organization.seat-limit-set', seatLimit: command.seatLimit }
}

function created(state: OrganizationState, event: CreateCommand) {
  state.organizationId = event.organizationId
  state.tenant = event.tenant
  state.name = event.name
  state.grantedRoles = []
  state.seatLimit = null
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function roleGranted(state: OrganizationState, event: { role: GrantedRole }) {
  if (state.grantedRoles.some((r) => sameGrantedRole(r, event.role))) return
  state.grantedRoles = [...state.grantedRoles, event.role]
}

function roleRevoked(state: OrganizationState, event: { role: GrantedRole }) {
  state.grantedRoles = state.grantedRoles.filter((r) => !sameGrantedRole(r, event.role))
}

function seatLimitSet(state: OrganizationState, event: { seatLimit: number | null }) {
  state.seatLimit = event.seatLimit
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
      grantedRoles: [],
      seatLimit: null,
      createdAt: '',
    },
    commands: {
      create,
      'grant-role': grantRole,
      'revoke-role': revokeRole,
      'set-seat-limit': setSeatLimit,
    },
    events: {
      created,
      'role-granted': roleGranted,
      'role-revoked': roleRevoked,
      'seat-limit-set': seatLimitSet,
    },
  }
}
