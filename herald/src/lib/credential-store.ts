// `sendingConfig.credential`/`webhookSecret` are write-only and never
// fields on the `sendingConfig` actor's state (Story 001) -- production
// pushes them directly to herald's own signet bundle via `SyncBundle`
// (ADR 0052), never through consequent, never through tower. Signet isn't
// available in this dev environment, so this in-memory Map is a documented
// stand-in that exists only so the PATCH /sending-config contract and the
// send worker's credential lookup can be exercised end-to-end in tests --
// it is not durable, not encrypted at rest, and must never be treated as a
// real secrets story.
export interface TenantCredentials {
  credential?: string
  webhookSecret?: string
}

export class CredentialStore {
  private byTenant = new Map<string, TenantCredentials>()

  set(tenant: string, credentials: TenantCredentials): void {
    const existing = this.byTenant.get(tenant) ?? {}
    this.byTenant.set(tenant, { ...existing, ...credentials })
  }

  get(tenant: string): TenantCredentials | undefined {
    return this.byTenant.get(tenant)
  }
}
