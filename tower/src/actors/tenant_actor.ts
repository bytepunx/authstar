// Per design/stories/tower/001-actor-definitions.md and
// design/stories/tower/011-tenant-management-and-key-rotation.md.
//
// `applications`/`providers` (the aggregateFrom-embedded arrays) and the
// `tenant.add-application`/`tenant.add-provider` commands that populate them
// are intentionally not implemented yet -- this pilot slice covers only
// creation and the tenant-management PATCH surface (name/cookie edits, the
// restricted active->suspended transition). aggregateFrom is left declared
// on the actor metadata so the shape matches Story 001 exactly; it has no
// effect until `application`/`provider` actors exist to aggregate from.

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

export interface TenantState {
  slug: string
  name: string
  status: 'active' | 'suspended' | 'deleted'
  cookie: TenantCookie
  seatLimit: number | null
  branding: TenantBranding
  applications: unknown[]
  providers: unknown[]
  createdAt: string
  createdBy: string
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
    },
    commands: {
      create,
      update,
      suspend: [
        { when: isActive, then: suspend },
        rejectSuspend,
      ],
    },
    events: {
      created,
      updated,
      suspended,
    },
  }
}
