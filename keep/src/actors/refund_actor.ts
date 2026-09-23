// Per design/stories/keep/001-actor-definitions.md ("refund").
//
// Keyed by `stripeRefundId`, not `stripeChargeId` -- a charge can have
// multiple partial refunds (ADR 0083). Created on `charge.refunded`. No
// automatic entitlement change -- visibility/audit only (ADR 0077).
// Read-only through the API -- no write routes at all, this actor only
// ever gets a `create` command from webhook handling.

export type RefundScope = { account: string } | { tenant: string }

export interface RefundState {
  stripeRefundId: string
  tenant: string
  scope: RefundScope
  stripeChargeId: string
  amount: number
  currency: string
  reason: string
  refundedAt: string
  createdAt: string
}

interface CreateCommand {
  stripeRefundId: string
  tenant: string
  scope: RefundScope
  stripeChargeId: string
  amount: number
  currency: string
  reason: string
  refundedAt: string
}

function create(_refund: RefundState, command: CreateCommand) {
  return {
    type: 'refund.created',
    stripeRefundId: command.stripeRefundId,
    tenant: command.tenant,
    scope: command.scope,
    stripeChargeId: command.stripeChargeId,
    amount: command.amount,
    currency: command.currency,
    reason: command.reason,
    refundedAt: command.refundedAt,
  }
}

function created(refund: RefundState, event: CreateCommand) {
  refund.stripeRefundId = event.stripeRefundId
  refund.tenant = event.tenant
  refund.scope = event.scope
  refund.stripeChargeId = event.stripeChargeId
  refund.amount = event.amount
  refund.currency = event.currency
  refund.reason = event.reason
  refund.refundedAt = event.refundedAt
  refund.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

export default function refundActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'refund',
      identifiedBy: 'stripeRefundId',
      searchableBy: ['tenant', 'stripeChargeId'],
    },
    state: {
      stripeRefundId: '',
      tenant: '',
      scope: { tenant: '' },
      stripeChargeId: '',
      amount: 0,
      currency: '',
      reason: '',
      refundedAt: '',
      createdAt: '',
    },
    commands: {
      create,
    },
    events: {
      created,
    },
  }
}
