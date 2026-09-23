// Per design/stories/keep/001-actor-definitions.md ("customer") and
// ADR 0083 (identifiedBy/searchableBy made explicit for the first time).
//
// Never created by an admin call -- always webhook-driven, first
// `checkout.session.completed`/`customer.subscription.created` (Story 002).
// `id` is a generated node-flakes id, not derived from `scope` -- a
// tenant-scoped and an account-scoped customer are both just "a customer
// record," no reason to give them different key shapes (ADR 0083).
//
// The `created` event handler deliberately never reads `event.id` --
// consequent reserves that field for the event's *own* stream identity
// (`dispatch.js`'s `enrichEvent` unconditionally overwrites whatever a
// command handler puts there with a freshly generated flake right before
// persisting). A handler that copies `event.id` into actor state picks up
// the right value by coincidence during the live command dispatch that
// created it (enrichment happens after event handlers run), then silently
// the *wrong* value on every subsequent fetch, once state is rebuilt by
// replaying the persisted (already-enriched) event from the store --
// found by fetching right after creating in a test, not by reading the
// source. Unnecessary anyway: consequent's own `populateActorState`
// (actors.js) already sets `state[identifiedBy]` to the id `fetch`/`handle`
// was called with, before any event handler ever runs.

export type CustomerScope = { account: string } | { tenant: string }

export interface CustomerState {
  id: string
  tenant: string
  scope: CustomerScope
  stripeCustomerId: string
  createdAt: string
}

interface CreateCommand {
  id: string
  tenant: string
  scope: CustomerScope
  stripeCustomerId: string
}

function create(_customer: CustomerState, command: CreateCommand) {
  return {
    type: 'customer.created',
    tenant: command.tenant,
    scope: command.scope,
    stripeCustomerId: command.stripeCustomerId,
  }
}

function created(customer: CustomerState, event: Omit<CreateCommand, 'id'>) {
  customer.tenant = event.tenant
  customer.scope = event.scope
  customer.stripeCustomerId = event.stripeCustomerId
  customer.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

export default function customerActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'customer',
      identifiedBy: 'id',
      searchableBy: ['tenant', 'scope', 'stripeCustomerId'],
    },
    state: {
      id: '',
      tenant: '',
      scope: { tenant: '' },
      stripeCustomerId: '',
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
