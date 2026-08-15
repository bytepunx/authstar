import { actingAsFields } from '../lib/acting-as.js'

// Per design/stories/tower/004-applications-and-providers.md and
// ADR 0067 (tenant creation seeds one default provider from the
// installation's `provisioning.defaultProvider` config). Same
// tenant-scoped-key pattern as `application_actor.ts`: `identifiedBy: 'key'`
// where `key = "${tenant}:${name}"`.
//
// The provider's `clientSecret` is deliberately never part of this actor's
// state -- it's a signet secret (`tenant-<slug>-provider-<name>-client-secret`,
// pushed by the provisioning flow), not an event-sourced field. This actor
// only carries the non-secret OIDC metadata.
//
// `discoveryStatus` (ADR 0073) starts `{status: 'ok', checkedAt: null,
// error: null}` -- an optimistic default, not a claim discovery has
// actually run yet; portcullis's own discovery cycle is the only writer,
// via a separate mTLS-only write-back route (`POST /provider-discovery-
// status`, explicitly out of `routes/providers.ts`'s scope per Story 004's
// own "Not Covered Here" -- not built in this pass either, since nothing
// in Story 013's own dependency chain calls for it).
//
// Story 004: "Rejects if name already exists (active or removed) under
// this tenant -- a removed provider's name isn't reusable, since its key
// must stay a stable historical reference." That's a `tenant.add-provider`-
// time guard (this actor's own `create` has no notion of "was this key
// used before", consistent with `application`/`tenant`'s own actors never
// re-deriving history at create time) -- see `tenant_actor.ts`'s
// `providerNameNotTaken`.
export interface DiscoveryStatus {
  status: 'ok' | 'error'
  checkedAt: string | null
  error: string | null
}

export interface ProviderState {
  tenant: string
  name: string
  clientId: string
  discoveryUrl: string
  scope: string[]
  discoveryStatus: DiscoveryStatus
  status: 'active' | 'removed'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  name: string
  clientId: string
  discoveryUrl: string
  scope: string[]
  actingAs?: string
}

interface UpdateCommand {
  clientId?: string
  discoveryUrl?: string
  scope?: string[]
  actingAs?: string
}

interface RemoveCommand {
  actingAs?: string
}

function create(_provider: ProviderState, command: CreateCommand) {
  return {
    type: 'provider.created',
    tenant: command.tenant,
    name: command.name,
    clientId: command.clientId,
    discoveryUrl: command.discoveryUrl,
    scope: command.scope ?? [],
    ...actingAsFields(command),
  }
}

function update(_provider: ProviderState, command: UpdateCommand) {
  return {
    type: 'provider.updated',
    clientId: command.clientId,
    discoveryUrl: command.discoveryUrl,
    scope: command.scope,
    ...actingAsFields(command),
  }
}

function isActive(provider: ProviderState) {
  return provider.status === 'active'
}

// `DELETE /tenants/{tenantSlug}/providers/{name}` is a soft alias for this
// (ADR 0053) -- same "already-removed is a no-op success at the route
// layer" convention `application.delete`/`account.delete` already follow,
// so this guard only ever fires for a genuine direct-command double-remove.
function remove(_provider: ProviderState, command: RemoveCommand) {
  return { type: 'provider.removed', ...actingAsFields(command) }
}

function rejectRemove() {
  return Promise.reject(new Error('provider already removed'))
}

function created(provider: ProviderState, event: CreateCommand) {
  provider.tenant = event.tenant
  provider.name = event.name
  provider.clientId = event.clientId
  provider.discoveryUrl = event.discoveryUrl
  provider.scope = event.scope ?? []
  provider.discoveryStatus = { status: 'ok', checkedAt: null, error: null }
  provider.status = 'active'
  provider.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function updated(provider: ProviderState, event: UpdateCommand) {
  if (event.clientId !== undefined) provider.clientId = event.clientId
  if (event.discoveryUrl !== undefined) provider.discoveryUrl = event.discoveryUrl
  if (event.scope !== undefined) provider.scope = event.scope
}

function removed(provider: ProviderState) {
  provider.status = 'removed'
}

export default function providerActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'provider',
      identifiedBy: 'key',
      searchableBy: ['tenant', 'status'],
    },
    state: {
      tenant: '',
      name: '',
      clientId: '',
      discoveryUrl: '',
      scope: [],
      discoveryStatus: { status: 'ok', checkedAt: null, error: null },
      status: 'active',
      createdAt: '',
    },
    commands: {
      create,
      update,
      remove: [
        { when: isActive, then: remove },
        rejectRemove,
      ],
    },
    events: {
      created,
      updated,
      removed,
    },
  }
}
