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
export interface ApplicationState {
  tenant: string
  slug: string
  name: string
  hosts: string[]
  exposedProviders: string[]
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  slug: string
  name: string
  hosts: string[]
  exposedProviders: string[]
}

interface UpdateCommand {
  name?: string
  hosts?: string[]
}

function create(_app: ApplicationState, command: CreateCommand) {
  return {
    type: 'application.created',
    tenant: command.tenant,
    slug: command.slug,
    name: command.name,
    hosts: command.hosts ?? [],
    exposedProviders: command.exposedProviders ?? [],
  }
}

function update(_app: ApplicationState, command: UpdateCommand) {
  return { type: 'application.updated', name: command.name, hosts: command.hosts }
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

function created(app: ApplicationState, event: CreateCommand) {
  app.tenant = event.tenant
  app.slug = event.slug
  app.name = event.name
  app.hosts = event.hosts ?? []
  app.exposedProviders = event.exposedProviders ?? []
  app.status = 'active'
  app.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(app: ApplicationState, event: { name?: string, hosts?: string[] }) {
  if (event.name !== undefined) app.name = event.name
  if (event.hosts !== undefined) app.hosts = event.hosts
}

function suspended(app: ApplicationState) {
  app.status = 'suspended'
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
    },
    events: {
      created,
      updated,
      suspended,
    },
  }
}
