// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/002-send-worker-and-retry.md.
//
// `searchableBy` here is a deliberate, reasonable addition beyond Story
// 001's literal shape (which shows no `searchableBy` for `communication` at
// all) -- Story 004's `GET /communications` list route needs to filter by
// `contactId`/`type`/`status`/date range, and the send worker's retry sweep
// needs to find `status: "pending"` records with `nextRetryAt <= now`.
// Story 001 says the route inventory is "not covered here," so this fills
// an implementation gap the later stories require, rather than contradicting
// anything stated.

export interface CommunicationState {
  key: string
  idempotencyKey: string
  tenant: string
  application: string
  contactId: string
  category: 'transactional' | 'marketing'
  type: string
  title: string
  templateVersion: number
  encryptedPayload: string
  payloadKeyVersion: number
  channel: string
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'suppressed'
  createdAt: string
  sentAt: string | null
  error: string | null
  retryCount: number
  nextRetryAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  payloadPurgedAt: string | null
  providerMessageId: string
  complainedAt: string | null
}

interface CreateCommand {
  idempotencyKey: string
  tenant: string
  application: string
  contactId: string
  category: 'transactional' | 'marketing'
  type: string
  title: string
  templateVersion: number
  encryptedPayload: string
  payloadKeyVersion: number
  channel: string
}

function exists(state: CommunicationState): boolean {
  return Boolean(state.createdAt)
}

// Terminal states -- a record here is done, one way or another. Retries
// happen entirely within `pending` (Story 002 never moves status away from
// pending for a transient failure, only for a permanent one).
function isPending(state: CommunicationState): boolean {
  return state.status === 'pending'
}

function isSent(state: CommunicationState): boolean {
  return state.status === 'sent'
}

function isFailed(state: CommunicationState): boolean {
  return state.status === 'failed'
}

// A command `then` handler's first parameter is the full `ActorInstance`
// wrapper, not bare state -- see the note in `communication_type_actor.ts`.
// `when` predicates (`isPending`/`isSent`/`isFailed` above) are unaffected;
// they correctly receive bare state already.
interface Instance { state: CommunicationState }

function create(instance: Instance, command: CreateCommand) {
  if (exists(instance.state)) {
    return Promise.reject(new Error(`communication already exists for idempotency key "${command.idempotencyKey}"`))
  }
  // Built out explicitly, not spread -- `command.type` (the communication
  // type's conventional name, e.g. "invite-sent") would otherwise collide
  // with the event envelope's own `type` discriminator field
  // (`"communication.created"`) that consequent dispatches on.
  return {
    type: 'communication.created',
    idempotencyKey: command.idempotencyKey,
    tenant: command.tenant,
    application: command.application,
    contactId: command.contactId,
    category: command.category,
    commType: command.type,
    title: command.title,
    templateVersion: command.templateVersion,
    encryptedPayload: command.encryptedPayload,
    payloadKeyVersion: command.payloadKeyVersion,
    channel: command.channel,
  }
}

// Either an opt-out or a blanket-suppression match -- same terminal value,
// nothing on the record distinguishes which (Story 001/ADR 0074).
function suppress(_state: CommunicationState) {
  return { type: 'communication.suppressed' }
}

function rejectSuppress() {
  return Promise.reject(new Error('communication is not in a suppressible state'))
}

function markSent(_state: CommunicationState, command: { providerMessageId: string }) {
  return { type: 'communication.sent', providerMessageId: command.providerMessageId }
}

function rejectMarkSent() {
  return Promise.reject(new Error('communication is not pending'))
}

function recordRetry(_state: CommunicationState, command: { nextRetryAt: string, lastError: string }) {
  return { type: 'communication.retryScheduled', nextRetryAt: command.nextRetryAt, lastError: command.lastError }
}

function rejectRecordRetry() {
  return Promise.reject(new Error('communication is not pending'))
}

function markFailed(_state: CommunicationState, command: { error: string }) {
  return { type: 'communication.failed', error: command.error }
}

function rejectMarkFailed() {
  return Promise.reject(new Error('communication is not in a failable state'))
}

// The manual-retry route (Story 002, `PATCH { status: "pending" }`) -- only
// reachable from `failed`, resets into the same sweep-eligible state a
// transient failure would naturally reach.
function resetForRetry(_state: CommunicationState) {
  return { type: 'communication.retryReset' }
}

function rejectResetForRetry() {
  return Promise.reject(new Error('only a failed communication can be manually retried'))
}

function markBounced(_state: CommunicationState) {
  return { type: 'communication.bounced' }
}

function rejectMarkBounced() {
  return Promise.reject(new Error('only a sent communication can be marked bounced'))
}

// Clears `encryptedPayload` past its type's `retentionDays` deadline (ADR
// 0029, Story 001) -- the command the (not-yet-built, see TESTING.md)
// scheduled retention sweep would call. `payloadPurgedAt` and `status` are
// independent axes (Story 001): reachable from any status, including
// terminal ones -- a `status: "sent"` record with a purged payload is the
// normal, expected end state once retention elapses, not an error.
function purgePayload(instance: Instance) {
  if (instance.state.payloadPurgedAt) {
    return Promise.reject(new Error('payload already purged'))
  }
  return { type: 'communication.payloadPurged' }
}

function payloadPurged(state: CommunicationState) {
  state.encryptedPayload = ''
  state.payloadPurgedAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function recordComplaint(_state: CommunicationState) {
  return { type: 'communication.complained' }
}

function rejectRecordComplaint() {
  return Promise.reject(new Error('only a sent communication can record a complaint'))
}

interface CreatedEvent {
  idempotencyKey: string
  tenant: string
  application: string
  contactId: string
  category: 'transactional' | 'marketing'
  commType: string
  title: string
  templateVersion: number
  encryptedPayload: string
  payloadKeyVersion: number
  channel: string
}

function created(state: CommunicationState, event: CreatedEvent) {
  state.key = `${event.tenant}:${event.idempotencyKey}`
  state.idempotencyKey = event.idempotencyKey
  state.tenant = event.tenant
  state.application = event.application
  state.contactId = event.contactId
  state.category = event.category
  state.type = event.commType
  state.title = event.title
  state.templateVersion = event.templateVersion
  state.encryptedPayload = event.encryptedPayload
  state.payloadKeyVersion = event.payloadKeyVersion
  state.channel = event.channel
  state.status = 'pending'
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
  state.sentAt = null
  state.error = null
  state.retryCount = 0
  state.nextRetryAt = null
  state.lastAttemptAt = null
  state.lastError = null
  state.payloadPurgedAt = null
  state.providerMessageId = ''
  state.complainedAt = null
}

function suppressed(state: CommunicationState) {
  state.status = 'suppressed'
}

function sent(state: CommunicationState, event: { providerMessageId: string }) {
  state.status = 'sent'
  state.sentAt = new Date(0).toISOString()
  state.providerMessageId = event.providerMessageId
}

function retryScheduled(state: CommunicationState, event: { nextRetryAt: string, lastError: string }) {
  state.retryCount += 1
  state.lastAttemptAt = new Date(0).toISOString()
  state.nextRetryAt = event.nextRetryAt
  state.lastError = event.lastError
}

function failed(state: CommunicationState, event: { error: string }) {
  state.status = 'failed'
  state.error = event.error
  state.nextRetryAt = null
}

function retryReset(state: CommunicationState) {
  state.status = 'pending'
  state.retryCount = 0
  state.nextRetryAt = new Date(0).toISOString()
  state.error = null
}

function bounced(state: CommunicationState) {
  state.status = 'bounced'
}

function complained(state: CommunicationState) {
  state.complainedAt = new Date(0).toISOString()
}

export default function communicationActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'communication',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'status', 'contactId', 'type'],
    },
    state: {
      key: '',
      idempotencyKey: '',
      tenant: '',
      application: '',
      contactId: '',
      category: 'transactional',
      type: '',
      title: '',
      templateVersion: 0,
      encryptedPayload: '',
      payloadKeyVersion: 0,
      channel: '',
      status: 'pending',
      createdAt: '',
      sentAt: null,
      error: null,
      retryCount: 0,
      nextRetryAt: null,
      lastAttemptAt: null,
      lastError: null,
      payloadPurgedAt: null,
      providerMessageId: '',
      complainedAt: null,
    },
    commands: {
      create,
      suppress: [
        { when: isPending, then: suppress },
        rejectSuppress,
      ],
      markSent: [
        { when: isPending, then: markSent },
        rejectMarkSent,
      ],
      recordRetry: [
        { when: isPending, then: recordRetry },
        rejectRecordRetry,
      ],
      markFailed: [
        { when: isPending, then: markFailed },
        rejectMarkFailed,
      ],
      resetForRetry: [
        { when: isFailed, then: resetForRetry },
        rejectResetForRetry,
      ],
      markBounced: [
        { when: isSent, then: markBounced },
        rejectMarkBounced,
      ],
      recordComplaint: [
        { when: isSent, then: recordComplaint },
        rejectRecordComplaint,
      ],
      purgePayload,
    },
    events: {
      created,
      suppressed,
      sent,
      retryScheduled,
      failed,
      retryReset,
      bounced,
      complained,
      payloadPurged,
    },
  }
}
