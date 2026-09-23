import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dialWorkload } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { purgeExpiredPayloads } from './lib/retention-purge.js'

// Standalone entrypoint for the retention purge CronJob (ADR 0029: "the
// same operational shape as ADR 0012's provisioner CronJob"). Runs the
// sweep once against real signet/Postgres and exits -- no fastify server,
// no RabbitMQ consumers/publisher, no `waitForRestart` coordinated-restart
// loop, mirroring keep's own `sync-pricing.ts` (that repo's identically-
// shaped periodic job, built the same pass -- see its own header comment
// for the fuller "why no long-lived machinery" reasoning, unchanged here).
// Packaged into the same container image `src/server.ts` builds into --
// the CronJob overrides the Pod's `command` to run this script instead of
// `dist/server.js`, rather than a second image to build/version.
//
// NOT LIVE-VALIDATED in this pass -- same scope note as `src/server.ts`
// itself (see TESTING.md). Every I/O boundary this file wires is exercised
// for real only indirectly, through `retention-purge.ts`'s own test tier
// (real in-memory `consequent`) and the real `consequent-postgres` wiring
// this file shares with `server.ts`, which that file's own integration
// coverage already exercises for the Postgres half.

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
  const service = process.env.SIGNET_SERVICE ?? 'herald'
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

  // eslint-disable-next-line no-console
  const log = (message: string) => console.log(message)
  const result = await purgeExpiredPayloads(consequent, log)
  log(`retention purge complete: ${result.typesChecked} type(s), ${result.checked} communication(s) checked, ${result.purged} purged, ${result.errors.length} error(s)`)
  for (const error of result.errors) {
    // eslint-disable-next-line no-console
    console.error(`retention purge error for communication ${error.key} (tenant ${error.tenant}): ${error.error}`)
  }

  await pgAdapters.close()
  workload.close()

  // A per-communication error is collected and logged above, not fatal to
  // the sweep -- but the Job itself should still report non-zero so a
  // Kubernetes-level "did this CronJob firing succeed" check has a real
  // signal, same reasoning as keep's own `sync-pricing.ts`.
  process.exit(result.errors.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
