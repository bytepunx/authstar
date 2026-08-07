// Per design/stories/keep/001-actor-definitions.md ("dispute").
//
// `charge.dispute.created` creates the record and degrades entitlements
// (route-layer concern, publishing side). `charge.dispute.closed` (won)
// reverses the degrade; (lost) updates the record only (ADR 0077).
// Read-only through the API -- no write routes at all, only `create`/
// `updateStatus` commands driven by webhook handling.

export type DisputeScope = { account: string } | { tenant: string }
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

function created(dispute: DisputeState, event: CreateCommand) {
  dispute.stripeDisputeId = event.stripeDisputeId
  dispute.tenant = event.tenant
  dispute.scope = event.scope
  dispute.stripeChargeId = event.stripeChargeId
  dispute.status = 'needs_response'
  dispute.amount = event.amount
  dispute.currency = event.currency
  dispute.reason = event.reason
  dispute.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function statusUpdated(dispute: DisputeState, event: UpdateStatusCommand) {
  dispute.status = event.status
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
      scope: { tenant: '' },
      stripeChargeId: '',
      status: 'needs_response',
      amount: 0,
      currency: '',
      reason: '',
      createdAt: '',
    },
    commands: {
      create,
      updateStatus,
    },
    events: {
      created,
      statusUpdated,
    },
  }
}
