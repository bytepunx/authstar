// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/005-webhooks-config-rotation-and-activity.md.
//
// A true per-tenant singleton -- keyed by bare `tenant` (Story 001, ADR
// 0084 confirms this needs no composite-key fix). `credential`/
// `webhookSecret` are deliberately never fields on this actor's state --
// write-only, pushed to herald's own signet bundle in production (see
// `src/lib/credential-store.ts` for the in-process stand-in this dev
// environment uses instead).

export interface SendingConfigState {
  tenant: string
  configuredAt: string
  provider: 'smtp' | 'ses' | 'sendgrid'
  fromAddress: string
  fromName: string
  replyTo: string
  physicalAddress: string
}

interface UpdateCommand {
  tenant: string
  provider?: 'smtp' | 'ses' | 'sendgrid'
  fromAddress?: string
  fromName?: string
  replyTo?: string
  physicalAddress?: string
}

// `GET`/`PATCH` (Story 005) -- there's no separate create route; the first
// PATCH for a tenant establishes the singleton, later ones edit it. Both
// paths go through this one `update` command.
//
// `configuredAt` exists purely as an existence marker, deliberately
// separate from `tenant` (the `identifiedBy` field) -- consequent
// auto-populates `state[identifiedBy]` on *every* fetch, including one for
// an actor that was never actually created (`actors.js#populateActorState`:
// `if (!copy.state[field]) copy.state[field] = id`), so checking `tenant`
// itself for existence would always read true. Same "never reuse the
// identifiedBy field as your own existence signal" lesson tower's
// `tenant_actor.ts` already encoded with `createdAt` -- missed here
// initially because `sendingConfig` doesn't have an obvious `createdAt`-
// shaped field in Story 001's own shape, and adding one is a deliberate,
// documented, minimal deviation to make existence actually checkable.
function update(_instance: { state: SendingConfigState }, command: UpdateCommand) {
  // Built out explicitly, not spread -- consequent auto-injects its own
  // `command.type = topic` (`"sendingConfig.update"`, the *command* name)
  // onto the incoming message before this handler ever runs
  // (`dispatch.js`: `if (!message.type) { message.type = topic }`).
  // `{ type: 'sendingConfig.updated', ...command }` would let that
  // injected field win (object spread applies in order, and `command`
  // comes second), silently replacing the intended event type with the
  // command's own topic string. The practical effect is nasty: consequent
  // treats the resulting "event" as another command with that same topic
  // and reprocesses it through the command dispatcher again, forever --
  // a real infinite loop this pilot's own test run caught as a hung
  // `handle()` promise, not a clean rejection or a stack overflow.
  return {
    type: 'sendingConfig.updated',
    tenant: command.tenant,
    provider: command.provider,
    fromAddress: command.fromAddress,
    fromName: command.fromName,
    replyTo: command.replyTo,
    physicalAddress: command.physicalAddress,
  }
}

function updated(state: SendingConfigState, event: UpdateCommand) {
  state.tenant = event.tenant
  state.configuredAt = state.configuredAt || new Date(0).toISOString() // replaced by consequent's own event timestamp on read; set once, never overwritten by later edits
  if (event.provider !== undefined) state.provider = event.provider
  if (event.fromAddress !== undefined) state.fromAddress = event.fromAddress
  if (event.fromName !== undefined) state.fromName = event.fromName
  if (event.replyTo !== undefined) state.replyTo = event.replyTo
  if (event.physicalAddress !== undefined) state.physicalAddress = event.physicalAddress
}

export default function sendingConfigActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'sendingConfig',
      identifiedBy: 'tenant',
    },
    state: {
      tenant: '',
      configuredAt: '',
      provider: 'smtp' as const,
      fromAddress: '',
      fromName: '',
      replyTo: '',
      physicalAddress: '',
    },
    commands: {
      update,
    },
    events: {
      updated,
    },
  }
}
