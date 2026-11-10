import type { Scope } from '../lib/scope.js'

// Per design/stories/keep/001-actor-definitions.md ("subscription").
//
// Keyed directly by `stripeSubscriptionId` -- Stripe-generated and globally
// unique, no tenant-prefixing needed; every webhook update
// (`customer.subscription.updated`/`.deleted`) is a direct fetch, not a
// search (ADR 0083). Read-only through the API, no DELETE route at all --
// state changes are exclusively webhook-driven (ADR 0053).

// ADR 0109: one scope type for every keep actor, `{account}` or `{organization}`.
export type SubscriptionScope = Scope

// ADR 0107: every status Stripe can send. Keep stores the status Stripe sent
// and never invents one.
export const SUBSCRIPTION_STATUSES = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]

// Whether a raw Stripe status is one keep mirrors.
export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

// ADR 0107: whether the plan's roles are in effect in tower. `degraded`
// means keep has revoked them; `granted` means it has granted them, or never
// revoked them since activation.
export type SubscriptionEntitlement = 'granted' | 'degraded'

export interface SubscriptionState {
  stripeSubscriptionId: string
  tenant: string
  scope: SubscriptionScope
  stripePriceId: string
  status: SubscriptionStatus
  currentPeriodEnd: string
  // Unset only on a record whose events predate ADR 0107; read it through `entitlementOf`.
  entitlement?: SubscriptionEntitlement
  // The `attempt_count` of the last failed invoice, and when Stripe retries
  // it (ISO 8601), until an invoice is paid; null when none is failing.
  lastFailedAttempt: number | null
  nextPaymentAttempt: string | null
  createdAt: string
}

// Statuses under which keep had already revoked a plan's roles before ADR
// 0107 recorded it: cancellation and pause revoked them, and an unpaid
// subscription had failed its payments.
const LEGACY_DEGRADED_STATUSES: readonly SubscriptionStatus[] = ['canceled', 'unpaid', 'paused']

// The subscription's entitlement state, derived from its status for a record
// whose events predate ADR 0107.
export function entitlementOf(subscription: SubscriptionState): SubscriptionEntitlement {
  if (subscription.entitlement) return subscription.entitlement
  return LEGACY_DEGRADED_STATUSES.includes(subscription.status) ? 'degraded' : 'granted'
}

interface CreateCommand {
  stripeSubscriptionId: string
  tenant: string
  scope: SubscriptionScope
  stripePriceId: string
  status: SubscriptionStatus
  currentPeriodEnd: string
}

interface UpdateCommand {
  status?: SubscriptionStatus
  stripePriceId?: string
  currentPeriodEnd?: string
}

interface RecordPaymentFailureCommand {
  attemptCount: number
  nextPaymentAttempt: string | null
}

function create(_subscription: SubscriptionState, command: CreateCommand) {
  return {
    type: 'subscription.created',
    stripeSubscriptionId: command.stripeSubscriptionId,
    tenant: command.tenant,
    scope: command.scope,
    stripePriceId: command.stripePriceId,
    status: command.status,
    currentPeriodEnd: command.currentPeriodEnd,
    // Activation grants the plan's roles (ADR 0107).
    entitlement: 'granted',
  }
}

function update(_subscription: SubscriptionState, command: UpdateCommand) {
  return {
    type: 'subscription.updated',
    status: command.status,
    stripePriceId: command.stripePriceId,
    currentPeriodEnd: command.currentPeriodEnd,
  }
}

function recordPaymentFailure(_subscription: SubscriptionState, command: RecordPaymentFailureCommand) {
  return {
    type: 'subscription.paymentFailed',
    attemptCount: command.attemptCount,
    nextPaymentAttempt: command.nextPaymentAttempt,
  }
}

function recordPayment(_subscription: SubscriptionState) {
  return { type: 'subscription.paid' }
}

function degrade(_subscription: SubscriptionState) {
  return { type: 'subscription.degraded' }
}

function restore(_subscription: SubscriptionState) {
  return { type: 'subscription.restored' }
}

function created(subscription: SubscriptionState, event: CreateCommand & { entitlement?: SubscriptionEntitlement }) {
  subscription.stripeSubscriptionId = event.stripeSubscriptionId
  subscription.tenant = event.tenant
  subscription.scope = event.scope
  subscription.stripePriceId = event.stripePriceId
  subscription.status = event.status
  subscription.currentPeriodEnd = event.currentPeriodEnd
  if (event.entitlement) subscription.entitlement = event.entitlement
  subscription.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(subscription: SubscriptionState, event: UpdateCommand) {
  if (event.status !== undefined) subscription.status = event.status
  if (event.stripePriceId !== undefined) subscription.stripePriceId = event.stripePriceId
  if (event.currentPeriodEnd !== undefined) subscription.currentPeriodEnd = event.currentPeriodEnd
}

function paymentFailed(subscription: SubscriptionState, event: RecordPaymentFailureCommand) {
  subscription.lastFailedAttempt = event.attemptCount
  subscription.nextPaymentAttempt = event.nextPaymentAttempt
}

function paid(subscription: SubscriptionState) {
  subscription.lastFailedAttempt = null
  subscription.nextPaymentAttempt = null
}

function degraded(subscription: SubscriptionState) {
  subscription.entitlement = 'degraded'
}

function restored(subscription: SubscriptionState) {
  subscription.entitlement = 'granted'
}

export default function subscriptionActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'subscription',
      identifiedBy: 'stripeSubscriptionId',
      searchableBy: ['tenant', 'scope', 'status'],
    },
    state: {
      stripeSubscriptionId: '',
      tenant: '',
      scope: { account: '' },
      stripePriceId: '',
      status: 'active',
      currentPeriodEnd: '',
      lastFailedAttempt: null,
      nextPaymentAttempt: null,
      createdAt: '',
    },
    commands: {
      create,
      update,
      recordPaymentFailure,
      recordPayment,
      degrade,
      restore,
    },
    events: {
      created,
      updated,
      paymentFailed,
      paid,
      degraded,
      restored,
    },
  }
}
