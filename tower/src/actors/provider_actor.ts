// Per design/stories/tower/004-applications-and-providers-management.md and
// ADR 0067 (tenant creation seeds one default provider from the
// installation's `provisioning.defaultProvider` config). Same
// tenant-scoped-key pattern as `application_actor.ts`: `identifiedBy: 'key'`
// where `key = "${tenant}:${name}"`.
//
// The provider's `clientSecret` is deliberately never part of this actor's
// state -- it's a signet secret (`tenant-<slug>-provider-<name>-client-secret`,
// pushed by the provisioning flow), not an event-sourced field. This actor
// only carries the non-secret OIDC metadata.
export interface ProviderState {
  tenant: string
  name: string
  clientId: string
  discoveryUrl: string
  scope: string[]
  status: 'active' | 'deleted'
  createdAt: string
}

interface CreateCommand {
  tenant: string
  name: string
  clientId: string
  discoveryUrl: string
  scope: string[]
}

function create(_provider: ProviderState, command: CreateCommand) {
  return {
    type: 'provider.created',
    tenant: command.tenant,
    name: command.name,
    clientId: command.clientId,
    discoveryUrl: command.discoveryUrl,
    scope: command.scope ?? [],
  }
}

function created(provider: ProviderState, event: CreateCommand) {
  provider.tenant = event.tenant
  provider.name = event.name
  provider.clientId = event.clientId
  provider.discoveryUrl = event.discoveryUrl
  provider.scope = event.scope ?? []
  provider.status = 'active'
  provider.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
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
      status: 'active',
      createdAt: '',
    },
    commands: { create },
    events: { created },
  }
}
