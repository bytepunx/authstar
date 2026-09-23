import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dialWorkload } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { createStripeClientFactory } from './lib/stripe-client.js'
import { createSignetStripeConfigStore } from './lib/signet-stripe-config-store.js'
import { syncAllPlanMappingPricing } from './lib/pricing-sync.js'

// Standalone entrypoint for the periodic pricing re-sync CronJob (design/
// stories/keep/003's "Periodic pricing re-sync" section: "the same
// operational shape as ADR 0012's provisioner CronJob"). Runs the sync
// once against real signet/Postgres/Stripe and exits -- no fastify server,
// no `waitForRestart` coordinated-restart loop (there's nothing long-lived
// here for a signet bundle change to interrupt; a fresh Job invocation
// simply dials signet fresh next time it fires). Packaged into the same
// container image `src/server.ts` builds into (`Dockerfile`'s existing
// `dist/` output already includes this file's compiled output) -- the
// CronJob overrides the Pod's `command` to run this script instead of
// `dist/server.js`, rather than introducing a second image to build and
// version alongside the first.
//
// NOT LIVE-VALIDATED in this pass -- same scope note as `src/server.ts`
// itself (see TESTING.md): every I/O boundary this file wires is exercised
// for real only indirectly, through `pricing-sync.ts`'s own test tier
// (fakes) and the real `consequent-postgres`/Stripe-client wiring this file
// shares with `server.ts`, which that file's own integration coverage
// already exercises for the Postgres half.

const actorsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'actors')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required environment variable ${name}`)
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
  const adminAddress = process.env.SIGNET_ADMIN_ADDR ?? address

  const workload = await dialWorkload({ address, trustDomain })

  let bundleResponse: { bundle?: Record<string, unknown> }
  try {
    bundleResponse = await new Promise((resolve, reject) => {
      workload.client.getServiceBundle({ namespace, service }, (err, resp) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })
  } catch (err) {
    workload.close()
    throw err
  }

  const bundle = bundleResponse.bundle ?? {}
  const secrets = decodeBundleSecrets(bundle)

  const dbConnectionString = (bundle.dbConnectionString as string | undefined) ?? secrets.dbConnectionString
  if (!dbConnectionString) throw new Error('signet bundle missing dbConnectionString')

  const pgAdapters = initializePostgresAdapters({ connectionString: dbConnectionString })
  // Same structural-vs-nominal adapter type friction `server.ts` casts at
  // this identical boundary -- see that file's own comment.
  const consequent = await initializeConsequent({
    actors: actorsPath,
    actorStore: pgAdapters.actor as never,
    eventStore: pgAdapters.event as never,
    searchAdapter: pgAdapters.search as never,
    logging: { level: 'info' },
  })

  const stripeClients = createStripeClientFactory()
  // ADR 0103: keep's own workload SVID authenticates this GitOps dial
  // directly -- no admin bearer token, no `CreatePolicy` grant. Same
  // `trustDomain` already verified above for the ordinary `dialWorkload`
  // bundle fetch.
  const stripeConfig = await createSignetStripeConfigStore({ address: adminAddress, trustDomain, initialSecrets: secrets })

  // eslint-disable-next-line no-console
  const log = (message: string) => console.log(message)
  const result = await syncAllPlanMappingPricing(consequent, stripeClients, stripeConfig, log)
  log(`pricing sync complete: checked ${result.checked}, updated ${result.updated}, ${result.errors.length} error(s)`)
  for (const error of result.errors) {
    // eslint-disable-next-line no-console
    console.error(`pricing sync error for plan mapping ${error.id} (tenant ${error.tenant}): ${error.error}`)
  }

  await pgAdapters.close()
  workload.close()

  // A per-mapping error is collected and logged above, not fatal to the
  // sweep -- but the Job itself should still report non-zero so a
  // Kubernetes-level "did this CronJob run succeed" check (and any
  // alerting built on it) has a real signal, rather than every firing
  // always reporting success regardless of what happened underneath.
  process.exit(result.errors.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
