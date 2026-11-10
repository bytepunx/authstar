import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { dialWorkload } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { searchCriteria, type ConsequentApi } from './lib/consequent-types.js'
import { isTenantScope } from './lib/scope.js'

// ADR 0109's one-off report: lists the records in keep's store that still
// carry the retired `{tenant}` scope, and changes none of them. Same
// standalone-entrypoint shape as `src/sync-pricing.ts`: it dials signet for
// keep's bundle, opens Postgres through consequent, runs once, and exits.
//
// It prints one JSON line per record on stdout and a count on stderr. It
// scans the tenants that have a Stripe configuration in keep's bundle
// (`stripe-secret-key-<slug>`), since only those tenants' webhooks can have
// written records, and any further tenant slugs given as arguments.
//
// Run: `npm run report:tenant-scope [-- <tenant-slug>...]` with the same
// SIGNET_* environment `src/sync-pricing.ts` reads.

// The actor types that carry a `scope`, each with the field that identifies its records.
const scopedRecordTypes = [
  { type: 'customer', idField: 'id' },
  { type: 'subscription', idField: 'stripeSubscriptionId' },
  { type: 'trial', idField: 'id' },
  { type: 'dispute', idField: 'stripeDisputeId' },
  { type: 'refund', idField: 'stripeRefundId' },
] as const

// One record that still holds `{tenant}` as its scope.
export interface TenantScopedRecord {
  type: (typeof scopedRecordTypes)[number]['type']
  id: string
  tenant: string
  scope: { tenant: string }
}

// Lists every customer, subscription, trial, dispute, and refund of the given tenants whose scope is `{tenant}`; writes nothing.
export async function findTenantScopedRecords(consequent: ConsequentApi, tenants: string[]): Promise<TenantScopedRecord[]> {
  const found: TenantScopedRecord[] = []
  for (const tenant of [...new Set(tenants)]) {
    for (const { type, idField } of scopedRecordTypes) {
      const instances = await consequent.find(type, searchCriteria({ tenant }))
      for (const instance of instances) {
        const state = instance.state as Record<string, unknown>
        if (!state.createdAt || !isTenantScope(state.scope)) continue
        found.push({ type, id: String(state[idField]), tenant, scope: state.scope })
      }
    }
  }
  return found
}

// The tenant slugs that have a Stripe secret key in keep's bundle.
export function tenantsWithStripeConfig(secrets: Record<string, string>): string[] {
  const prefix = 'stripe-secret-key-'
  return Object.keys(secrets).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
}

const actorsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'actors')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required environment variable ${name}: set it as for src/sync-pricing.ts`)
  return value
}

function decodeBundleSecrets(bundle: Record<string, unknown> | undefined): Record<string, string> {
  const secrets = (bundle?.secrets as Record<string, string> | undefined) ?? {}
  const decoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    decoded[key] = Buffer.from(value, 'base64').toString('utf8')
  }
  return decoded
}

async function main(): Promise<void> {
  const namespace = requireEnv('SIGNET_NAMESPACE')
  const service = process.env.SIGNET_SERVICE ?? 'keep'
  const address = requireEnv('SIGNET_ADDR')
  const trustDomain = requireEnv('SIGNET_TRUST_DOMAIN')

  const workload = await dialWorkload({ address, trustDomain })
  let bundleResponse: { bundle?: Record<string, unknown> }
  try {
    bundleResponse = await new Promise((resolve, reject) => {
      workload.client.getServiceBundle({ namespace, service }, (err, resp) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })
  } finally {
    workload.close()
  }

  const bundle = bundleResponse.bundle ?? {}
  const secrets = decodeBundleSecrets(bundle)
  const dbConnectionString = (bundle.dbConnectionString as string | undefined) ?? secrets.dbConnectionString
  if (!dbConnectionString) throw new Error(`signet bundle ${namespace}/${service} has no dbConnectionString: check keep's bundle`)

  const pgAdapters = initializePostgresAdapters({ connectionString: dbConnectionString })
  // Same structural-vs-nominal adapter type cast `server.ts` and `sync-pricing.ts` make here.
  const consequent = await initializeConsequent({
    actors: actorsPath,
    actorStore: pgAdapters.actor as never,
    eventStore: pgAdapters.event as never,
    searchAdapter: pgAdapters.search as never,
    logging: { level: 'info' },
  })

  const tenants = [...tenantsWithStripeConfig(secrets), ...process.argv.slice(2)]
  const records = await findTenantScopedRecords(consequent, tenants)
  for (const record of records) {
    process.stdout.write(`${JSON.stringify(record)}\n`)
  }
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'info', component: 'keep.report-tenant-scope', msg: 'tenant-scoped records listed', tenants: tenants.length, records: records.length })}\n`)

  await pgAdapters.close()
}

// Runs only when executed directly, so the behavior tier can import the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'fatal', component: 'keep.report-tenant-scope', msg: 'tenant-scope report failed', err: String(err instanceof Error ? err.stack ?? err.message : err) })}\n`)
    process.exit(1)
  })
}
