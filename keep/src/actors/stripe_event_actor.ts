// A Stripe webhook event keep has handled (S-0005). The webhook route
// records one after the event's handler succeeds, and answers a redelivery
// of a recorded event 200 without running any handler, so a redelivered or
// retried event changes nothing and publishes nothing a second time.
//
// `identifiedBy: 'key'` where `key = "${tenant}:${stripeEventId}"`, the
// keyed-record pattern of `entitlement_sequence_actor.ts`: Stripe event ids
// are unique within one Stripe account, and each tenant owns its own
// account (ADR 0046), so the tenant prefix keeps two tenants' ids apart.
// Keyed lookup is a `fetch`, not a search. The Stripe id lives in the key
// and in `stripeEventId`, never copied from consequent's own `event.id`,
// which consequent overwrites on persist (customer_actor.ts, TESTING.md).
export interface StripeEventState {
  key: string
  tenant: string
  stripeEventId: string
  type: string
  processedAt: string
}

interface RecordCommand {
  tenant: string
  stripeEventId: string
  type: string
}

function record(_state: StripeEventState, command: RecordCommand) {
  return {
    type: 'stripeEvent.recorded',
    tenant: command.tenant,
    stripeEventId: command.stripeEventId,
    eventType: command.type,
  }
}

function recorded(state: StripeEventState, event: { tenant: string, stripeEventId: string, eventType: string }) {
  state.tenant = event.tenant
  state.stripeEventId = event.stripeEventId
  state.type = event.eventType
  state.processedAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

// The record's key for one tenant's Stripe event.
export function stripeEventKey(tenant: string, stripeEventId: string): string {
  return `${tenant}:${stripeEventId}`
}

export default function stripeEventActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'stripeEvent',
      identifiedBy: 'key',
      searchableBy: ['tenant'],
    },
    state: {
      key: '',
      tenant: '',
      stripeEventId: '',
      type: '',
      processedAt: '',
    },
    commands: {
      record,
    },
    events: {
      recorded,
    },
  }
}
