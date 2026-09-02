import type { ProvisioningConfig } from '../routes/provisioning.js'

// ADR 0102: once a service is in Signet-Configured Mode (tower always is --
// `SIGNET_ADDR`/`SIGNET_NAMESPACE`/`SIGNET_TRUST_DOMAIN` are `requireEnv`'d
// unconditionally in server.ts, with no Env-Only Mode for tower), a bundle
// field the service expects that's missing from the fetched bundle is a
// startup failure naming the exact missing field/secret -- never a silent
// `?? false` / `?? ''` / `?? {...}` hardcoded literal, and never a fallback
// to a same-named env var. This module is the one place the previously-
// silent-fallback `provisioning.*` block gets resolved, so `server.ts`'s
// untested `main()` stays a thin wiring shell (see TESTING.md's scope note
// on entrypoints) and the actual precedence/fail-loud logic is covered here
// instead.
//
// ADR 0103 removed this module's other resident, `resolveSignetAdminToken`:
// tower no longer holds or resolves a `signetAdminToken` secret at all --
// `createSignetAdmin` (signet-admin.ts) authenticates GitOps writes with
// tower's own workload SPIFFE identity instead, the same credential
// `dialWorkload` already uses for its ordinary bundle fetch.

function missingFieldError(field: string): Error {
  return new Error(`signet bundle missing ${field} -- provision it in signet`)
}

export function resolveProvisioningConfig(
  bundle: Record<string, unknown>,
  secrets: Record<string, string>,
): ProvisioningConfig {
  const provisioning = bundle.provisioning as Record<string, unknown> | undefined
  if (!provisioning) throw missingFieldError('provisioning')

  // `selfServiceEnabled` is a real boolean setting, not an absence-implies-off
  // switch -- `false` is a valid, explicitly-provisioned value and must be
  // distinguished from "the field isn't in the bundle at all" (`?? false`
  // used to conflate the two).
  if (!('selfServiceEnabled' in provisioning) || typeof provisioning.selfServiceEnabled !== 'boolean') {
    throw missingFieldError('provisioning.selfServiceEnabled')
  }
  const selfServiceEnabled = provisioning.selfServiceEnabled

  const operatorToken = secrets.operatorToken
  if (!operatorToken) throw missingFieldError('operatorToken secret')

  const defaultProvider = provisioning.defaultProvider as ProvisioningConfig['defaultProvider'] | undefined
  if (!defaultProvider) throw missingFieldError('provisioning.defaultProvider')

  const missingSubFields = (['name', 'clientId', 'discoveryUrl', 'scope'] as const).filter((field) => {
    const value = defaultProvider[field]
    return field === 'scope' ? !Array.isArray(value) : typeof value !== 'string' || value === ''
  })
  if (missingSubFields.length > 0) {
    throw missingFieldError(`provisioning.defaultProvider.${missingSubFields.join(', provisioning.defaultProvider.')}`)
  }

  const defaultProviderClientSecret = secrets['default-provider-client-secret']
  if (!defaultProviderClientSecret) throw missingFieldError('default-provider-client-secret secret')

  return {
    selfServiceEnabled,
    operatorToken,
    defaultProvider,
    defaultProviderClientSecret,
  }
}
