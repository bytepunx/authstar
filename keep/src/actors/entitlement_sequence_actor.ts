// Backs `entitlement-publisher.ts`'s own `SequenceProvider` durably (that
// file's header comment flags the gap this closes: sequence numbers were
// in-memory-only, reset to zero on every restart). A dedicated consequent
// actor rather than a bespoke Postgres counter table -- gets the same
// durable, replicated, event-sourced storage every other piece of keep's
// state already has for free, no new infrastructure.
//
// `identifiedBy: 'key'` where `key = "${tenant}:${scopeKey}"` -- one
// monotonically-increasing counter per (tenant, scope), matching
// `SequenceProvider`'s own contract exactly (ADR 0031's ordering-defense
// tooling assumes a single sequence space a consumer can detect gaps
// against, not one per event type).
//
// `increment`'s handler reads `instance.state.value`, not a bare `state`
// parameter -- confirmed directly against `consequent`'s own
// `apply.js` (`processCommand` calls `handle(instance, command)` for a
// *command* handler, unlike an *event* handler which correctly receives
// bare `instance.state`; tower's own TESTING.md documents this exact gotcha
// after a real bug it caused there).
export interface EntitlementSequenceState {
  key: string
  value: number
}

interface CommandInstance {
  state: EntitlementSequenceState
}

function increment(instance: CommandInstance) {
  return { type: 'entitlementSequence.incremented', value: (instance.state.value ?? 0) + 1 }
}

function incremented(state: EntitlementSequenceState, event: { value: number }) {
  state.value = event.value
}

export default function entitlementSequenceActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'entitlementSequence',
      identifiedBy: 'key',
    },
    state: {
      key: '',
      value: 0,
    },
    commands: {
      increment,
    },
    events: {
      incremented,
    },
  }
}
