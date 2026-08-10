// Per design/stories/tower/001-actor-definitions.md and
// design/stories/tower/011-tenant-management-and-key-rotation.md.
//
// `applications`/`providers` (the aggregateFrom-embedded arrays) were
// originally left unpopulated -- Story 012 (tenant creation/provisioning,
// ADR 0067) now populates them via `add-application`/`add-provider`, but
// deliberately *not* through consequent's own cross-actor `aggregateFrom`
// event-routing mechanism (declared on `actor.aggregateFrom` below only to
// keep the shape matching Story 001 exactly). That mechanism (see
// `consequent/dist/manager.js`'s `getSourceIds`/`onActor`) infers actor
// *ids* to aggregate from state fields it never gets a chance to see here
// (this command runs against `tenant` itself, before any child id exists)
// and is undocumented enough in practice that hand-rolling a plain
// `tenant.add-application` event that both creates the child `application`
// actor (via a direct `consequent.handle` call in the route/orchestration
// layer, see `src/routes/provisioning.ts`) and appends a lightweight
// reference into this actor's own array is a safer, equally-correct
// substitute for this pilot slice -- explicitly a scope trade-off, not an
// oversight.
export interface TenantCookie {
  domain: string
  path: string
  maxAge: number
  httpOnly: true
  secure: boolean
}

export interface TenantBranding {
  name: string
  logoUrl: string
  primaryColor: string
}

export interface TenantApplicationRef {
  slug: string
  name: string
}

export interface TenantProviderRef {
  name: string
}

export interface TenantState {
  slug: string
  name: string
  status: 'active' | 'suspended' | 'deleted'
  cookie: TenantCookie
  seatLimit: number | null
  branding: TenantBranding
  applications: TenantApplicationRef[]
  providers: TenantProviderRef[]
  createdAt: string
  createdBy: string
  // Story 012/ADR 0067: flips true only after all four provisioning
  // secrets (session key, internal key, identity-hash-key generation 1,
  // contact-hash-pepper) have been successfully pushed to signet -- lets a
  // retried `POST /tenants` for an already-created slug skip re-pushing
  // (and re-randomizing) secrets it already provisioned. Not present on
  // Story 011's original shape; additive.
  secretsProvisioned: boolean
}

interface CreateCommand {
  slug: string
  name: string
  cookieDomain: string
  createdBy: string
}

interface UpdateCommand {
  name?: string
  cookie?: Partial<Pick<TenantCookie, 'domain' | 'path' | 'maxAge' | 'secure'>>
}

interface SuspendCommand {
  status: 'suspended'
}

interface AddApplicationCommand {
  slug: string
  name: string
}

interface AddProviderCommand {
  name: string
}

interface SetSeatLimitCommand {
  seatLimit: number | null
}

interface MarkSecretsProvisionedCommand {}

function create(_tenant: TenantState, command: CreateCommand) {
  return {
    type: 'tenant.created',
    slug: command.slug,
    name: command.name,
    cookieDomain: command.cookieDomain,
    createdBy: command.createdBy,
  }
}

function update(_tenant: TenantState, command: UpdateCommand) {
  return {
    type: 'tenant.updated',
    name: command.name,
    cookie: command.cookie,
  }
}

// `active -> suspended` only -- `suspended -> active` and any transition to
// `deleted` are structurally unreachable through this actor's own command
// surface at all, not merely rejected by a permission check (ADR 0062).
// Reactivation is a *different* command (`reactivate`), reachable only via
// the operator route -- not implemented in this pilot slice.
function isActive(tenant: TenantState) {
  return tenant.status === 'active'
}

function suspend(_tenant: TenantState, _command: SuspendCommand) {
  return { type: 'tenant.suspended' }
}

// Must reject via a rejected promise, not a synchronous `throw` --
// consequent's own `processCommand` only wraps the handler's *return value*
// in `Promise.resolve(...).then(onSuccess, onError)` (apply.ts); a
// synchronous throw happens before that promise chain is even established
// and breaks the actor's command queue instead of producing a clean
// `{ rejected: true }` result. Confirmed directly against consequent's
// source after a real hang in this pilot's own tests -- not a hypothetical.
function rejectSuspend() {
  return Promise.reject(new Error('tenant must be active to be suspended'))
}

// Idempotent by construction -- a retried `POST /tenants` calling this
// again for a slug already present in `applications` is a silent no-op at
// the event-handler layer (see `applicationAdded` below), not a rejection,
// matching ADR 0067's "retry-same-request is the recovery model".
function addApplication(_tenant: TenantState, command: AddApplicationCommand) {
  return { type: 'tenant.application-added', slug: command.slug, name: command.name }
}

function addProvider(_tenant: TenantState, command: AddProviderCommand) {
  return { type: 'tenant.provider-added', name: command.name }
}

function setSeatLimit(_tenant: TenantState, command: SetSeatLimitCommand) {
  return { type: 'tenant.seat-limit-set', seatLimit: command.seatLimit }
}

function markSecretsProvisioned(_tenant: TenantState, _command: MarkSecretsProvisionedCommand) {
  return { type: 'tenant.secrets-provisioned' }
}

function created(tenant: TenantState, event: { slug: string, name: string, cookieDomain: string, createdBy: string }) {
  tenant.slug = event.slug
  tenant.name = event.name
  tenant.status = 'active'
  tenant.cookie = {
    domain: event.cookieDomain,
    path: '/',
    maxAge: 604_800,
    httpOnly: true,
    secure: true,
  }
  tenant.seatLimit = null
  tenant.branding = { name: '', logoUrl: '', primaryColor: '' }
  tenant.applications = []
  tenant.providers = []
  tenant.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
  tenant.createdBy = event.createdBy
  tenant.secretsProvisioned = false
}

function updated(tenant: TenantState, event: { name?: string, cookie?: Partial<TenantCookie> }) {
  if (event.name !== undefined) {
    tenant.name = event.name
  }
  if (event.cookie) {
    // `httpOnly` is never accepted here -- stays fixed at `true`, not a
    // configuration choice at all, not even for the operator (ADR 0062).
    tenant.cookie = { ...tenant.cookie, ...event.cookie, httpOnly: true }
  }
}

function suspended(tenant: TenantState) {
  tenant.status = 'suspended'
}

function applicationAdded(tenant: TenantState, event: { slug: string, name: string }) {
  if (tenant.applications.some((a) => a.slug === event.slug)) return
  tenant.applications = [...tenant.applications, { slug: event.slug, name: event.name }]
}

function providerAdded(tenant: TenantState, event: { name: string }) {
  if (tenant.providers.some((p) => p.name === event.name)) return
  tenant.providers = [...tenant.providers, { name: event.name }]
}

function seatLimitSet(tenant: TenantState, event: { seatLimit: number | null }) {
  tenant.seatLimit = event.seatLimit
}

function secretsProvisioned(tenant: TenantState) {
  tenant.secretsProvisioned = true
}

export default function tenantActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'tenant',
      identifiedBy: 'slug',
      searchableBy: ['status'],
      aggregateFrom: ['application', 'provider'],
    },
    state: {
      slug: '',
      name: '',
      status: 'active',
      cookie: { domain: '', path: '/', maxAge: 604_800, httpOnly: true, secure: true },
      seatLimit: null,
      branding: { name: '', logoUrl: '', primaryColor: '' },
      applications: [],
      providers: [],
      createdAt: '',
      createdBy: '',
      secretsProvisioned: false,
    },
    commands: {
      create,
      update,
      suspend: [
        { when: isActive, then: suspend },
        rejectSuspend,
      ],
      'add-application': addApplication,
      'add-provider': addProvider,
      'set-seat-limit': setSeatLimit,
      'mark-secrets-provisioned': markSecretsProvisioned,
    },
    events: {
      created,
      updated,
      suspended,
      'application-added': applicationAdded,
      'provider-added': providerAdded,
      'seat-limit-set': seatLimitSet,
      'secrets-provisioned': secretsProvisioned,
    },
  }
}
