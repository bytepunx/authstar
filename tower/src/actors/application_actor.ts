// Per design/stories/tower/004-applications-and-providers-management.md and
// ADR 0067 (tenant creation auto-creates the `_admin` application). A
// standalone actor (not aggregated onto `tenant` via consequent's own
// `aggregateFrom` cross-actor event routing -- see the comment atop
// `tenant_actor.ts` for why this pilot slice hand-rolls that link instead).
//
// `identifiedBy: 'key'` where `key = "${tenant}:${slug}"` -- application
// slugs are only unique *within* a tenant, so the actor id must be
// tenant-scoped. Callers (routes, the provisioning flow) compute this key
// themselves before calling `consequent.handle(key, 'application.create', ...)`.
//
// `slug: "_admin"` is the one reserved slug every *other* creation path
// must reject outright -- enforced by the caller (ADR 0067's provisioning
// flow is the only permitted creator of `_admin`), not by this actor, since
// consequent actors have no notion of "which route called me".
// `publicUrl` is the one field of ADR 0020's full shape this pilot slice
// carries beyond the original create/update/suspend trio -- Story 004's
// `publicUrl`-host-must-be-in-`hosts` validation (ADR 0051) is cheap and
// worth having for real; `upstream`/`cors`/`exempt`/`auth` are deliberately
// NOT added here -- those are portcullis-routing-config concerns with no
// bearing on ADR 0047's actual driver (keep's reference cache needs to know
// whether an application slug exists and is active, nothing about how
// portcullis routes to it), and adding them would be scope expansion this
// task's own driving need never asked for. See routes/applications.ts.
export interface ApplicationState {
  tenant: string
  slug: string
  name: string
  hosts: string[]
  publicUrl: string
  exposedProviders: string[]
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  slug: string
  name: string
  hosts: string[]
  publicUrl: string
  exposedProviders: string[]
}

interface UpdateCommand {
  name?: string
  hosts?: string[]
  publicUrl?: string
  exposedProviders?: string[]
}

function create(_app: ApplicationState, command: CreateCommand) {
  return {
    type: 'application.created',
    tenant: command.tenant,
    slug: command.slug,
    name: command.name,
    hosts: command.hosts ?? [],
    publicUrl: command.publicUrl ?? '',
    exposedProviders: command.exposedProviders ?? [],
  }
}

function update(_app: ApplicationState, command: UpdateCommand) {
  return {
    type: 'application.updated',
    name: command.name,
    hosts: command.hosts,
    publicUrl: command.publicUrl,
    exposedProviders: command.exposedProviders,
  }
}

function isActive(app: ApplicationState) {
  return app.status === 'active'
}

function suspend() {
  return { type: 'application.suspended' }
}

function rejectSuspend() {
  return Promise.reject(new Error('application must be active to be suspended'))
}

// `DELETE /tenants/{tenantSlug}/applications/{appSlug}` is a soft alias for
// this (ADR 0051) -- the route itself treats an already-deleted application
// as a no-op success rather than calling this command again (matching
// `accounts.ts`'s change-email no-op convention), so this guard only ever
// fires for a genuine direct-command double-delete, not an ordinary retry.
function isNotDeleted(app: ApplicationState) {
  return app.status !== 'deleted'
}

function del() {
  return { type: 'application.deleted' }
}

function rejectDelete() {
  return Promise.reject(new Error('application already deleted'))
}

function created(app: ApplicationState, event: CreateCommand) {
  app.tenant = event.tenant
  app.slug = event.slug
  app.name = event.name
  app.hosts = event.hosts ?? []
  app.publicUrl = event.publicUrl ?? ''
  app.exposedProviders = event.exposedProviders ?? []
  app.status = 'active'
  app.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(app: ApplicationState, event: { name?: string, hosts?: string[], publicUrl?: string, exposedProviders?: string[] }) {
  if (event.name !== undefined) app.name = event.name
  if (event.hosts !== undefined) app.hosts = event.hosts
  if (event.publicUrl !== undefined) app.publicUrl = event.publicUrl
  if (event.exposedProviders !== undefined) app.exposedProviders = event.exposedProviders
}

function suspended(app: ApplicationState) {
  app.status = 'suspended'
}

function deleted(app: ApplicationState) {
  app.status = 'deleted'
}

export default function applicationActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'application',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'status'],
    },
    state: {
      tenant: '',
      slug: '',
      name: '',
      hosts: [],
      publicUrl: '',
      exposedProviders: [],
      status: 'active',
      createdAt: '',
    },
    commands: {
      create,
      update,
      suspend: [
        { when: isActive, then: suspend },
        rejectSuspend,
      ],
      delete: [
        { when: isNotDeleted, then: del },
        rejectDelete,
      ],
    },
    events: {
      created,
      updated,
      suspended,
      deleted,
    },
  }
}
