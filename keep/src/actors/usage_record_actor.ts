// Per design/stories/keep/001-actor-definitions.md ("usageRecord") and
// design/stories/keep/005-usage-records-and-credentials.md.
//
// `key` (`${tenant}:${idempotencyKey}`) is tenant-scoped specifically
// because `idempotencyKey` is application-supplied, not internally
// generated (ADR 0083) -- a less trusted source than this design's other
// identifiers. No DELETE -- already correctly immutable, API/webhook-driven
// only (ADR 0053). Idempotency itself (a redelivered report with the same
// key is a no-op, not a double-charge) is enforced at the route layer via a
// pre-check (`consequent.fetch` for an existing record) before calling
// `create` at all -- not encoded as an actor-level guard, since the correct
// response to a duplicate is "return the existing record successfully," not
// a rejection.

export interface UsageRecordState {
  key: string
  tenant: string
  application: string
  accountId: string
  meter: string
  quantity: number
  idempotencyKey: string
  createdAt: string
}

interface CreateCommand {
  key: string
  tenant: string
  application: string
  accountId: string
  meter: string
  quantity: number
  idempotencyKey: string
}

function create(_record: UsageRecordState, command: CreateCommand) {
  return {
    type: 'usageRecord.created',
    key: command.key,
    tenant: command.tenant,
    application: command.application,
    accountId: command.accountId,
    meter: command.meter,
    quantity: command.quantity,
    idempotencyKey: command.idempotencyKey,
  }
}

function created(record: UsageRecordState, event: CreateCommand) {
  record.key = event.key
  record.tenant = event.tenant
  record.application = event.application
  record.accountId = event.accountId
  record.meter = event.meter
  record.quantity = event.quantity
  record.idempotencyKey = event.idempotencyKey
  record.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

export default function usageRecordActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'usageRecord',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'application', 'meter'],
    },
    state: {
      key: '',
      tenant: '',
      application: '',
      accountId: '',
      meter: '',
      quantity: 0,
      idempotencyKey: '',
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
