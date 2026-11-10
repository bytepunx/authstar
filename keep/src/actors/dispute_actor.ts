import type { Scope } from '../lib/scope.js'

// Per design/stories/keep/001-actor-definitions.md ("dispute").
//
// `charge.dispute.created` creates the record and degrades entitlements
// (route-layer concern, publishing side). `charge.dispute.closed` (won)
// reverses the degrade; (lost) updates the record only (ADR 0077).
// Read-only through the API -- no write routes at all, only `create`/
// `updateStatus`/`recordDegrade` commands driven by webhook handling.
//
// ADR 0107: the scope is resolved through the disputed charge's customer,
// never from dispute metadata, and the record names the subscription the
// dispute degraded, so that a won dispute restores that one and no other.

// ADR 0109: keep's one scope type, `{account}` or `{organization}`, or `null`
// when no customer record names the charge's customer: the record is kept
// for visibility, and no entitlement follows from it.
export type DisputeScope = Scope | null
export type DisputeStatus = 'needs_response' | 'under_review' | 'won' | 'lost'

export interface DisputeState {
  stripeDisputeId: string
  tenant: string
  scope: DisputeScope
  stripeChargeId: string
  status: DisputeStatus
  amount: number
  currency: string
  reason: string
  // The subscription this dispute degraded, or null when it degraded none:
  // no customer record, no subscription, or one already degraded.
  degradedSubscriptionId: string | null
  createdAt: string
}

interface CreateCommand {
  stripeDisputeId: string
  tenant: string
  scope: DisputeScope
  stripeChargeId: string
  amount: number
  currency: string
  reason: string
}

interface UpdateStatusCommand {
  status: DisputeStatus
}

interface RecordDegradeCommand {
  stripeSubscriptionId: string
}

function create(_dispute: DisputeState, command: CreateCommand) {
  return {
    type: 'dispute.created',
    stripeDisputeId: command.stripeDisputeId,
    tenant: command.tenant,
    scope: command.scope,
    stripeChargeId: command.stripeChargeId,
    amount: command.amount,
    currency: command.currency,
    reason: command.reason,
  }
}

function updateStatus(_dispute: DisputeState, command: UpdateStatusCommand) {
  return {
    type: 'dispute.statusUpdated',
    status: command.status,
  }
}

function recordDegrade(_dispute: DisputeState, command: RecordDegradeCommand) {
  return {
    type: 'dispute.degradeRecorded',
    stripeSubscriptionId: command.stripeSubscriptionId,
  }
}

function created(dispute: DisputeState, event: CreateCommand) {
  dispute.stripeDisputeId = event.stripeDisputeId
  dispute.tenant = event.tenant
  dispute.scope = event.scope
  dispute.stripeChargeId = event.stripeChargeId
  dispute.status = 'needs_response'
  dispute.amount = event.amount
  dispute.currency = event.currency
  dispute.reason = event.reason
  dispute.degradedSubscriptionId = null
  dispute.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function statusUpdated(dispute: DisputeState, event: UpdateStatusCommand) {
  dispute.status = event.status
}

function degradeRecorded(dispute: DisputeState, event: RecordDegradeCommand) {
  dispute.degradedSubscriptionId = event.stripeSubscriptionId
}

export default function disputeActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'dispute',
      identifiedBy: 'stripeDisputeId',
      searchableBy: ['tenant', 'stripeChargeId', 'status'],
    },
    state: {
      stripeDisputeId: '',
      tenant: '',
      scope: null,
      stripeChargeId: '',
      status: 'needs_response',
      amount: 0,
      currency: '',
      reason: '',
      degradedSubscriptionId: null,
      createdAt: '',
    },
    commands: {
      create,
      updateStatus,
      recordDegrade,
    },
    events: {
      created,
      statusUpdated,
      degradeRecorded,
    },
  }
}
