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

export interface SubscriptionState {
  stripeSubscriptionId: string
  tenant: string
  scope: SubscriptionScope
  stripePriceId: string
  status: SubscriptionStatus
  currentPeriodEnd: string
  createdAt: string
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

function create(_subscription: SubscriptionState, command: CreateCommand) {
  return {
    type: 'subscription.created',
    stripeSubscriptionId: command.stripeSubscriptionId,
    tenant: command.tenant,
    scope: command.scope,
    stripePriceId: command.stripePriceId,
    status: command.status,
    currentPeriodEnd: command.currentPeriodEnd,
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

function created(subscription: SubscriptionState, event: CreateCommand) {
  subscription.stripeSubscriptionId = event.stripeSubscriptionId
  subscription.tenant = event.tenant
  subscription.scope = event.scope
  subscription.stripePriceId = event.stripePriceId
  subscription.status = event.status
  subscription.currentPeriodEnd = event.currentPeriodEnd
  subscription.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(subscription: SubscriptionState, event: UpdateCommand) {
  if (event.status !== undefined) subscription.status = event.status
  if (event.stripePriceId !== undefined) subscription.stripePriceId = event.stripePriceId
  if (event.currentPeriodEnd !== undefined) subscription.currentPeriodEnd = event.currentPeriodEnd
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
      createdAt: '',
    },
    commands: {
      create,
      update,
    },
    events: {
      created,
      updated,
    },
  }
}
