// Per design/stories/keep/001-actor-definitions.md ("trial") and
// design/stories/keep/004-trials-and-coupons.md.
//
// `extensions` is the actual audit mechanism behind "an admin extends or
// reissues a trial" -- extend and reissue are the same operation, appending
// a new entry (ADR 0039/0041). `DELETE` is an alias for
// `PATCH { status: "expired" }` (ADR 0053). Conversion (trial -> converted)
// is a side effect of Story 002's webhook handling, not a route of its own.

export type TrialScope = { account: string } | { tenant: string }
export type TrialStatus = 'active' | 'converted' | 'expired'

export interface GrantedRole {
  application: string
  role: string
}

export interface TrialExtension {
  by: string
  at: string
  newExpiresAt: string
}

export interface TrialState {
  id: string
  tenant: string
  scope: TrialScope
  grantedRoles: GrantedRole[]
  seatLimit: number | null
  expiresAt: string
  status: TrialStatus
  extensions: TrialExtension[]
  createdAt: string
}

interface CreateCommand {
  id: string
  tenant: string
  scope: TrialScope
  grantedRoles: GrantedRole[]
  seatLimit: number | null
  expiresAt: string
}

interface ExtendCommand {
  by: string
  newExpiresAt: string
}

// Deliberately never emits an `id` field on the produced event --
// consequent reserves `event.id` for the event's own stream identity and
// overwrites it with a freshly generated flake before persisting
// (`dispatch.js`'s `enrichEvent`); `state.id` is already correctly set by
// consequent's own `populateActorState` before any event handler runs, so
// echoing it through event data is both unnecessary and actively wrong on
// replay (see plan_mapping_actor.ts's `create` for the full explanation --
// same bug, same fix, three keep actors hit it: customer/planMapping/trial,
// the three with `identifiedBy: 'id'`).
function create(_trial: TrialState, command: CreateCommand) {
  return {
    type: 'trial.created',
    tenant: command.tenant,
    scope: command.scope,
    grantedRoles: command.grantedRoles,
    seatLimit: command.seatLimit,
    expiresAt: command.expiresAt,
  }
}

function isActive(trial: TrialState) {
  return trial.status === 'active'
}

function extend(_trial: TrialState, command: ExtendCommand) {
  return {
    type: 'trial.extended',
    by: command.by,
    at: new Date().toISOString(),
    newExpiresAt: command.newExpiresAt,
  }
}

function rejectExtend() {
  return Promise.reject(new Error('only an active trial can be extended'))
}

function expire(_trial: TrialState) {
  return { type: 'trial.expired' }
}

function rejectExpire() {
  return Promise.reject(new Error('only an active trial can be expired'))
}

function convert(_trial: TrialState) {
  return { type: 'trial.converted' }
}

function rejectConvert() {
  return Promise.reject(new Error('only an active trial can convert'))
}

function created(trial: TrialState, event: Omit<CreateCommand, 'id'>) {
  trial.tenant = event.tenant
  trial.scope = event.scope
  trial.grantedRoles = event.grantedRoles
  trial.seatLimit = event.seatLimit
  trial.expiresAt = event.expiresAt
  trial.status = 'active'
  trial.extensions = []
  trial.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function extended(trial: TrialState, event: { by: string, at: string, newExpiresAt: string }) {
  trial.extensions = [...trial.extensions, { by: event.by, at: event.at, newExpiresAt: event.newExpiresAt }]
  trial.expiresAt = event.newExpiresAt
}

function expired(trial: TrialState) {
  trial.status = 'expired'
}

function converted(trial: TrialState) {
  trial.status = 'converted'
}

export default function trialActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'trial',
      identifiedBy: 'id',
      searchableBy: ['tenant', 'scope', 'status'],
    },
    state: {
      id: '',
      tenant: '',
      scope: { tenant: '' },
      grantedRoles: [],
      seatLimit: null,
      expiresAt: '',
      status: 'active',
      extensions: [],
      createdAt: '',
    },
    commands: {
      create,
      extend: [
        { when: isActive, then: extend },
        rejectExtend,
      ],
      expire: [
        { when: isActive, then: expire },
        rejectExpire,
      ],
      convert: [
        { when: isActive, then: convert },
        rejectConvert,
      ],
    },
    events: {
      created,
      extended,
      expired,
      converted,
    },
  }
}
