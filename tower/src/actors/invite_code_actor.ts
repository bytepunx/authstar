// Per design/stories/tower/007-invites-and-invite-codes.md and ADR
// 0019/0082's corrected shape. Built from scratch this pass -- no prior
// implementation existed (see TESTING.md's now-resolved "Code-based
// invites" scope note).
//
// `identifiedBy: 'key'` where `key = "${tenant}:${code}"` (ADR 0082's
// correction from ADR 0019's original bare-`code` key) -- `code` itself may
// repeat freely *across* tenants (a `LAUNCH50` under two different tenants
// is fine), only the composite `key` must be unique. Callers
// (`routes/invite-codes.ts`) compute this key themselves before calling
// `consequent.handle(key, 'inviteCode.create', ...)`, same pattern
// `role_definition_actor.ts`/`application_actor.ts` already established.
//
// Unlike `invite`, `application` here is a plain string (`''` = tenant-wide,
// not `null`) -- matches ADR 0082's own shape exactly, not `invite`'s
// convention; the two actors independently settled on different
// tenant-wide sentinels before this pass and there's no reason to force
// them to agree now.
export interface InviteCodeState {
  key: string
  code: string
  tenant: string
  application: string
  issuedBy: string
  roles: Array<{ name: string, scope: 'tenant' | { application: string } }>
  trialDurationDays: number | null
  maxRedemptions: number | null
  redemptionCount: number
  status: 'active' | 'revoked' | 'expired'
  expiresAt: string | null
  createdAt: string
}

interface CreateCommand {
  tenant: string
  code: string
  application: string
  issuedBy: string
  roles: InviteCodeState['roles']
  trialDurationDays: number | null
  maxRedemptions: number | null
  expiresAt: string | null
}

interface RedeemCommand {}

// The composite key **is** the uniqueness constraint (same reasoning
// `role_definition_actor.ts`'s own header comment documents in full,
// including the real concurrency gap `routes/invite-codes.ts`'s own
// `inviteCodeMutex` closes -- `consequent`'s per-actor queue alone does
// NOT make this guard race-free, see `src/lib/mutex.ts`). A duplicate
// `key` is rejected whether the existing code is `active`, `revoked`, or
// `expired` -- a given tenant's `LAUNCH50` shouldn't mean something
// different to whoever encounters an old reference to it later (Story
// 007's own stated reasoning, same as `roleDefinition`/`provider`).
function doesNotExist(state: InviteCodeState) {
  return !state.createdAt
}

function create(_state: InviteCodeState, command: CreateCommand) {
  return {
    type: 'inviteCode.created',
    tenant: command.tenant,
    code: command.code,
    application: command.application,
    issuedBy: command.issuedBy,
    roles: command.roles ?? [],
    trialDurationDays: command.trialDurationDays,
    maxRedemptions: command.maxRedemptions,
    expiresAt: command.expiresAt,
  }
}

function rejectDuplicateCreate() {
  return Promise.reject(new Error('an invite code with this code already exists for this tenant'))
}

// The three independent checks ADR 0019 specifies -- status, expiry,
// capacity -- evaluated every time, never collapsed into a single derived
// status (Story 007: "status is not auto-transitioned to 'expired' on
// exhausting maxRedemptions"). `redemptionCount` only increments on a
// genuine, guard-passing redemption -- `consequent`'s own per-actor queue
// serializes concurrent `redeem` calls against *this* actor id correctly
// (unlike the create-time duplicate-key race, this guard reads the same
// instance the queue already serialized access to, not a pre-fetched
// snapshot from a different call -- no separate mutex needed here).
function isRedeemable(inviteCode: InviteCodeState) {
  if (inviteCode.status !== 'active') return false
  if (inviteCode.expiresAt && new Date(inviteCode.expiresAt).getTime() < Date.now()) return false
  if (inviteCode.maxRedemptions !== null && inviteCode.redemptionCount >= inviteCode.maxRedemptions) return false
  return true
}

function redeem(_state: InviteCodeState, _command: RedeemCommand) {
  return { type: 'inviteCode.redeemed' }
}

function rejectRedeem() {
  return Promise.reject(new Error('invite code is not active, has expired, or has reached its redemption limit'))
}

// `DELETE /tenants/{tenantSlug}/invite-codes/{code}` is a soft alias for
// this (ADR 0053) -- the route treats an already-revoked code as a no-op
// success, matching every other actor's own DELETE convention in this
// codebase, so this guard only ever fires for a genuine direct
// double-revoke.
function isActive(inviteCode: InviteCodeState) {
  return inviteCode.status === 'active'
}

function revoke() {
  return { type: 'inviteCode.revoked' }
}

function rejectRevoke() {
  return Promise.reject(new Error('invite code is not active'))
}

function created(state: InviteCodeState, event: CreateCommand) {
  state.tenant = event.tenant
  state.code = event.code
  state.application = event.application
  state.issuedBy = event.issuedBy
  state.roles = event.roles ?? []
  state.trialDurationDays = event.trialDurationDays
  state.maxRedemptions = event.maxRedemptions
  state.redemptionCount = 0
  state.status = 'active'
  state.expiresAt = event.expiresAt
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function redeemed(state: InviteCodeState) {
  state.redemptionCount += 1
}

function revoked(state: InviteCodeState) {
  state.status = 'revoked'
}

export default function inviteCodeActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'inviteCode',
      identifiedBy: 'key',
      searchableBy: ['issuedBy', 'tenant', 'status'],
    },
    state: {
      key: '',
      code: '',
      tenant: '',
      application: '',
      issuedBy: '',
      roles: [],
      trialDurationDays: null,
      maxRedemptions: null,
      redemptionCount: 0,
      status: 'active',
      expiresAt: null,
      createdAt: '',
    },
    commands: {
      create: [
        { when: doesNotExist, then: create },
        rejectDuplicateCreate,
      ],
      redeem: [
        { when: isRedeemable, then: redeem },
        rejectRedeem,
      ],
      revoke: [
        { when: isActive, then: revoke },
        rejectRevoke,
      ],
    },
    events: {
      created,
      redeemed,
      revoked,
    },
  }
}
