// Per design/stories/keep/001-actor-definitions.md ("coupon") and
// design/stories/keep/004-trials-and-coupons.md.
//
// `key` (`${tenant}:${code}`) is the real identifier -- `code` may repeat
// freely across tenants (ADR 0083, identical fix to tower's `inviteCode`,
// ADR 0082). Creation rejects if the exact key already exists in any status
// ("active"/"revoked"/"expired") -- same historical-reference-stability
// reasoning as tower's `roleDefinition`/`provider`. `PATCH { status:
// "revoked" }` is the real revoke mechanism, `DELETE` an alias (ADR 0053).

export interface GrantedRole {
  application: string
  role: string
}

export type CouponStatus = 'active' | 'revoked' | 'expired'

export interface CouponState {
  key: string
  code: string
  tenant: string
  grantedRoles: GrantedRole[]
  trialDurationDays: number | null
  seatLimit: number | null
  maxRedemptions: number | null
  redemptionCount: number
  status: CouponStatus
  expiresAt: string | null
  createdAt: string
}

interface CreateCommand {
  key: string
  code: string
  tenant: string
  grantedRoles: GrantedRole[]
  trialDurationDays: number | null
  seatLimit: number | null
  maxRedemptions: number | null
  expiresAt: string | null
}

// A coupon that was never created still has a valid-shaped, all-default
// CouponState (consequent's getOrCreate returns the actor module's own
// default `state` rather than null) -- `createdAt` is the one field only
// the `created` event handler ever sets, the same "did this actor's
// creation event ever apply" sentinel tower's own tenant_actor uses.
function neverCreated(coupon: CouponState) {
  return !coupon.createdAt
}

function create(_coupon: CouponState, command: CreateCommand) {
  return {
    type: 'coupon.created',
    key: command.key,
    code: command.code,
    tenant: command.tenant,
    grantedRoles: command.grantedRoles,
    trialDurationDays: command.trialDurationDays,
    seatLimit: command.seatLimit,
    maxRedemptions: command.maxRedemptions,
    expiresAt: command.expiresAt,
  }
}

function rejectCreate() {
  return Promise.reject(new Error('a coupon with this code already exists for this tenant'))
}

function isActive(coupon: CouponState) {
  return coupon.status === 'active'
}

function revoke(_coupon: CouponState) {
  return { type: 'coupon.revoked' }
}

function rejectRevoke() {
  return Promise.reject(new Error('coupon is already revoked'))
}

// Redemption isn't its own route (Story 004: "not a web-facing endpoint on
// this surface") -- exposed as a command so a future checkout-flow story
// can call it, and so this pilot can exercise the redemption-count/limit
// bookkeeping with real tests now rather than leaving it unverified.
function canRedeem(coupon: CouponState) {
  if (coupon.status !== 'active') return false
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) return false
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return false
  return true
}

function redeem(_coupon: CouponState) {
  return { type: 'coupon.redeemed' }
}

function rejectRedeem() {
  return Promise.reject(new Error('coupon is not eligible for redemption'))
}

function created(coupon: CouponState, event: CreateCommand) {
  coupon.key = event.key
  coupon.code = event.code
  coupon.tenant = event.tenant
  coupon.grantedRoles = event.grantedRoles
  coupon.trialDurationDays = event.trialDurationDays
  coupon.seatLimit = event.seatLimit
  coupon.maxRedemptions = event.maxRedemptions
  coupon.redemptionCount = 0
  coupon.status = 'active'
  coupon.expiresAt = event.expiresAt
  coupon.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function revoked(coupon: CouponState) {
  coupon.status = 'revoked'
}

function redeemed(coupon: CouponState) {
  coupon.redemptionCount += 1
}

export default function couponActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'coupon',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'status'],
    },
    state: {
      key: '',
      code: '',
      tenant: '',
      grantedRoles: [],
      trialDurationDays: null,
      seatLimit: null,
      maxRedemptions: null,
      redemptionCount: 0,
      status: 'active',
      expiresAt: null,
      createdAt: '',
    },
    commands: {
      create: [
        { when: neverCreated, then: create },
        rejectCreate,
      ],
      revoke: [
        { when: isActive, then: revoke },
        rejectRevoke,
      ],
      redeem: [
        { when: canRedeem, then: redeem },
        rejectRedeem,
      ],
    },
    events: {
      created,
      revoked,
      redeemed,
    },
  }
}
