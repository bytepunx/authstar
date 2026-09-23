// Per design/stories/tower/008-contacts-erasure-and-export.md and ADR
// 0026/0040/0075. `identifiedBy: 'contactId'` -- created once per erasure
// (`DELETE /tenants/:tenantSlug/contacts/:contactId`), tracking which
// downstream services (herald, keep, ...) have acknowledged purging their
// own copies of this contact's PII.
//
// `EXPECTED_SERVICES` is a fixed, hardcoded constant (per ADR 0026: "must
// be deliberately extended when new PII-holding services join", not
// runtime config) -- computed at read time, never persisted on the actor
// itself, so a service added after a request was created still shows up in
// that request's own outstanding list rather than being silently grandfathered
// in as already-satisfied.
//
// No timeout, ever, by design (ADR 0075) -- stays `pending` indefinitely if
// a service never acknowledges; staleness is a read-time computation for
// operator tooling (`olderThanHours`), never a write to this actor. Not
// implemented in this pilot slice: the cross-tenant `/operator/erasure-requests/stuck`
// view itself (see TESTING.md).
//
// A real `consequent` behavior found while building this actor's own
// `acknowledge` command (see TESTING.md's bug list, #4): a command's `then`
// handler is invoked with the *whole* `ActorInstance` wrapper as its first
// argument, not `instance.state` -- unlike an *event* handler, which
// correctly receives `instance.state` (confirmed directly against
// `consequent/dist/apply.js`'s `processCommand` vs. `processEvent`). Every
// pre-existing command handler in this codebase happened to never read
// that first argument, which is why this went unnoticed until a handler
// here actually needed to read prior state to decide whether to also
// transition `status` to `completed`. Fixed by moving that decision into
// the `acknowledged` event handler below (which *does* get real state)
// rather than trying to read it from a command handler.
export const EXPECTED_SERVICES = ['herald', 'keep'] as const

export interface ErasureRequestState {
  tenant: string
  contactId: string
  accountId: string | null
  requestedAt: string
  status: 'pending' | 'completed'
  acknowledgedBy: string[]
}

interface CreateCommand {
  tenant: string
  contactId: string
  accountId: string | null
}

interface AcknowledgeCommand {
  service: string
}

function create(_req: ErasureRequestState, command: CreateCommand) {
  return {
    type: 'erasureRequest.created',
    tenant: command.tenant,
    contactId: command.contactId,
    accountId: command.accountId,
  }
}

// Deliberately a single, unconditional event -- a *command* handler's first
// parameter is not reliable to read state off of, so completion is decided
// entirely inside the `acknowledged` *event* handler below, against the
// real current state, not a value pre-computed here (see this file's own
// header comment / TESTING.md for why: command `then` handlers are called
// with the whole ActorInstance wrapper as their first argument, not
// `instance.state`, unlike event handlers).
function acknowledge(_req: ErasureRequestState, command: AcknowledgeCommand) {
  return { type: 'erasureRequest.acknowledged', service: command.service }
}

function created(req: ErasureRequestState, event: CreateCommand) {
  req.tenant = event.tenant
  req.contactId = event.contactId
  req.accountId = event.accountId
  req.requestedAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
  req.status = 'pending'
  req.acknowledgedBy = []
}

// Idempotent accumulation *and* the pending->completed transition, both
// decided here against real state (event handlers correctly receive
// `instance.state`, per consequent's own `apply.ts`/`processEvent`) --
// deliberately not a separate `completed` event, see `acknowledge` above.
function acknowledged(req: ErasureRequestState, event: AcknowledgeCommand) {
  if (!req.acknowledgedBy.includes(event.service)) {
    req.acknowledgedBy = [...req.acknowledgedBy, event.service]
  }
  if (req.status !== 'completed' && EXPECTED_SERVICES.every((s) => req.acknowledgedBy.includes(s))) {
    req.status = 'completed'
  }
}

export default function erasureRequestActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'erasureRequest',
      identifiedBy: 'contactId',
      searchableBy: ['tenant', 'status'],
    },
    state: {
      tenant: '',
      contactId: '',
      accountId: null,
      requestedAt: '',
      status: 'pending',
      acknowledgedBy: [],
    },
    commands: {
      create,
      acknowledge,
    },
    events: {
      created,
      acknowledged,
    },
  }
}
