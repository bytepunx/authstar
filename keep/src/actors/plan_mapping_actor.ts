// Per design/stories/keep/001-actor-definitions.md ("planMapping") and
// design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md.
//
// Fully tenant-defined, including writes (billing:manage, ADR 0046 --
// controlling over ADR 0042/0045's since-superseded operator-only premise).
// `unitAmount`/`currency`/`interval` are a cache synced from Stripe at
// create/edit time and by a periodic re-sync job -- Stripe stays
// authoritative (ADR 0060); this actor never accepts them as untrusted
// client input, only as values the route layer already resolved via the
// injectable Stripe client before calling `create`/`syncPricing`.
// `grantedRoles` validation against keep's local tower-sourced reference
// cache (ADR 0047) happens at the route layer, not here -- the actor has no
// way to reach that cache and shouldn't need to.

export type PlanMappingScope = { account: string } | { tenant: string }
export type PlanMappingInterval = 'month' | 'year'
export type PlanMappingStatus = 'active' | 'retired'

export interface GrantedRole {
  application: string
  role: string
}

// design/decisions/0101-api-keys.md. `apiKeyRateLimit` mirrors keep's own
// `EntitlementPublisher`-facing shape 1:1 (see entitlement-publisher.ts) --
// no separate route-layer type, since nothing here transforms it.
export interface ApiKeyRateLimit {
  requestsPerMinute: number
  burst?: number
}

export interface PlanMappingState {
  id: string
  tenant: string
  stripePriceId: string
  name: string
  seatLimit: number | null
  grantedRoles: GrantedRole[]
  meter: string | null
  // design/decisions/0101-api-keys.md, added after this actor's own
  // original ADR 0083 design -- same mechanical addition `meter` above
  // already went through (field + default -> Create/UpdateCommand ->
  // create()/update() -> created()/updated()). `null` = unlimited, matching
  // `seatLimit`'s own meaning; unlike `seatLimit`, `{account}` scope is
  // meaningful for this field (an individual account's own key allowance),
  // so this plan mapping can target it via `PlanMappingScope` same as any
  // other field here.
  apiKeyLimit: number | null
  apiKeyRateLimit: ApiKeyRateLimit | null
  unitAmount: number | null
  currency: string
  interval: PlanMappingInterval
  status: PlanMappingStatus
  createdAt: string
}

interface CreateCommand {
  id: string
  tenant: string
  stripePriceId: string
  name: string
  seatLimit: number | null
  grantedRoles: GrantedRole[]
  meter: string | null
  apiKeyLimit: number | null
  apiKeyRateLimit: ApiKeyRateLimit | null
  unitAmount: number
  currency: string
  interval: PlanMappingInterval
}

interface UpdateCommand {
  name?: string
  seatLimit?: number | null
  grantedRoles?: GrantedRole[]
  meter?: string | null
  apiKeyLimit?: number | null
  apiKeyRateLimit?: ApiKeyRateLimit | null
}

interface SyncPricingCommand {
  unitAmount: number
  currency: string
  interval: PlanMappingInterval
}

// Event `type` strings must be exactly `${actor.type}.${eventName}` --
// consequent's own loader (`processHandles` in loader.js) auto-prefixes any
// dot-free event-handler key with the actor's literal `type` string
// ('planMapping', camelCase, not a kebab-case variant) to build the lookup
// key `apply()` uses when dispatching a produced event to its handler.
// Confirmed directly against consequent's source, not assumed -- getting
// this wrong doesn't error, it just silently never calls the `created`
// handler (state never updates, no error surfaced).
//
// Also deliberately never emits an `id` field -- consequent reserves
// `event.id` for the event's own stream identity and unconditionally
// overwrites it with a freshly generated flake right before persisting
// (`dispatch.js`'s `enrichEvent`). `state.id` doesn't need it anyway:
// consequent's own `populateActorState` (actors.js) already sets
// `state[identifiedBy]` to the id `fetch`/`handle` was called with, before
// any event handler runs. (Found by fetching right after creating in a
// test -- the live-dispatch return value looks right because enrichment
// hasn't happened yet, and only the *next* fetch, which replays the
// already-enriched persisted event, reveals the bug.)
function create(_mapping: PlanMappingState, command: CreateCommand) {
  return {
    type: 'planMapping.created',
    tenant: command.tenant,
    stripePriceId: command.stripePriceId,
    name: command.name,
    seatLimit: command.seatLimit,
    grantedRoles: command.grantedRoles,
    meter: command.meter,
    apiKeyLimit: command.apiKeyLimit,
    apiKeyRateLimit: command.apiKeyRateLimit,
    unitAmount: command.unitAmount,
    currency: command.currency,
    interval: command.interval,
  }
}

function update(_mapping: PlanMappingState, command: UpdateCommand) {
  return {
    type: 'planMapping.updated',
    name: command.name,
    seatLimit: command.seatLimit,
    grantedRoles: command.grantedRoles,
    meter: command.meter,
    apiKeyLimit: command.apiKeyLimit,
    apiKeyRateLimit: command.apiKeyRateLimit,
  }
}

function syncPricing(_mapping: PlanMappingState, command: SyncPricingCommand) {
  return {
    type: 'planMapping.pricing-synced',
    unitAmount: command.unitAmount,
    currency: command.currency,
    interval: command.interval,
  }
}

// `DELETE` is an alias for `PATCH { status: "retired" }` (ADR 0053) -- a
// real delete would break renewal processing for existing subscribers still
// on the plan. Guarded the same way tower's tenant.suspend is: retiring an
// already-retired mapping is a 409, not a silent no-op.
function isActive(mapping: PlanMappingState) {
  return mapping.status === 'active'
}

function retire(_mapping: PlanMappingState) {
  return { type: 'planMapping.retired' }
}

// Must reject via a rejected promise, not a synchronous throw --
// consequent's own apply.ts only wraps a handler's *return value* in a
// promise chain; a synchronous throw hangs the actor's command queue
// instead of producing a clean `{ rejected: true }` result.
function rejectRetire() {
  return Promise.reject(new Error('plan mapping is already retired'))
}

function created(mapping: PlanMappingState, event: Omit<CreateCommand, 'id'>) {
  mapping.tenant = event.tenant
  mapping.stripePriceId = event.stripePriceId
  mapping.name = event.name
  mapping.seatLimit = event.seatLimit
  mapping.grantedRoles = event.grantedRoles
  mapping.meter = event.meter
  mapping.apiKeyLimit = event.apiKeyLimit
  mapping.apiKeyRateLimit = event.apiKeyRateLimit
  mapping.unitAmount = event.unitAmount
  mapping.currency = event.currency
  mapping.interval = event.interval
  mapping.status = 'active'
  mapping.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(mapping: PlanMappingState, event: UpdateCommand) {
  if (event.name !== undefined) mapping.name = event.name
  if (event.seatLimit !== undefined) mapping.seatLimit = event.seatLimit
  if (event.grantedRoles !== undefined) mapping.grantedRoles = event.grantedRoles
  if (event.meter !== undefined) mapping.meter = event.meter
  if (event.apiKeyLimit !== undefined) mapping.apiKeyLimit = event.apiKeyLimit
  if (event.apiKeyRateLimit !== undefined) mapping.apiKeyRateLimit = event.apiKeyRateLimit
}

function pricingSynced(mapping: PlanMappingState, event: SyncPricingCommand) {
  mapping.unitAmount = event.unitAmount
  mapping.currency = event.currency
  mapping.interval = event.interval
}

function retired(mapping: PlanMappingState) {
  mapping.status = 'retired'
}

export default function planMappingActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'planMapping',
      identifiedBy: 'id',
      // ADR 0083's list was `['tenant', 'stripePriceId', 'status']` --
      // `meter` added here because Story 005's usage-record recording path
      // rejects an unrecognized meter by looking up the tenant's own
      // metered plan mappings (`find({tenant, meter})`); ADR 0083 predates
      // Story 005 and never had a reason to name it. Same field, same
      // reasoning ADR 0083 already used for `stripePriceId` (webhook lookup
      // needs to find-by-value, not just display it).
      searchableBy: ['tenant', 'stripePriceId', 'status', 'meter'],
    },
    state: {
      id: '',
      tenant: '',
      stripePriceId: '',
      name: '',
      seatLimit: null,
      grantedRoles: [],
      meter: null,
      apiKeyLimit: null,
      apiKeyRateLimit: null,
      unitAmount: null,
      currency: '',
      interval: 'month',
      status: 'active',
      createdAt: '',
    },
    commands: {
      create,
      update,
      syncPricing,
      retire: [
        { when: isActive, then: retire },
        rejectRetire,
      ],
    },
    events: {
      created,
      updated,
      'pricing-synced': pricingSynced,
      retired,
    },
  }
}
