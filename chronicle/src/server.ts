import pino, { type Logger } from 'pino'
import { dialWorkload, waitForRestart, type WorkloadConnection } from '@bytepunx/signet-client'
import buildApp from './lib/build-app.js'
import buildConsumer from './consumer/build-consumer.js'
import RealClickHouseClient from './lib/clickhouse-client.js'
import { loadEnvConfig, type ChronicleConfig } from './lib/config.js'
import { decodeBundleSecrets, resolveConfigFromBundle } from './lib/signet-bundle-config.js'

// Production entrypoint. ADR 0102 / Story 003: unlike keep/herald/tower
// (which require signet unconditionally), chronicle is one of the four
// services -- alongside lookout, steward, web -- permitted to run in
// Env-Only Mode. Presence of `SIGNET_ADDR` alone gates which of the two
// modes this boots into (`loadConfig` below); the two modes otherwise
// converge on the exact same `ChronicleConfig` shape everything past this
// point already consumed before this story.
//
// The signet dial/bundle-fetch/restart-lock sequence itself follows the
// same `dialWorkload`/`getServiceBundle`/`waitForRestart` pattern
// established by keep's and herald's own `src/server.ts` (see those files'
// header comments for the fuller rationale) -- only reached when
// Signet-Configured Mode applies. This file has no test coverage of its
// own, consistent with how TESTING.md scopes every other authstar
// service's entrypoint the same way; the fail-loud bundle resolution logic
// it delegates to (`signet-bundle-config.ts`) is unit-tested directly, and
// the Env-Only path it delegates to (`config.ts`'s `loadEnvConfig`) already
// was.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

interface SignetHandle {
  workload: WorkloadConnection
  namespace: string
  service: string
  configVersion: number
}

interface LoadedConfig {
  config: ChronicleConfig
  signet?: SignetHandle
}

async function loadConfig(logger: Logger): Promise<LoadedConfig> {
  const signetAddr = process.env.SIGNET_ADDR
  if (!signetAddr) {
    return { config: loadEnvConfig((message) => logger.warn(message)) }
  }

  const namespace = requireEnv('SIGNET_NAMESPACE')
  const service = process.env.SIGNET_SERVICE ?? 'chronicle'
  const trustDomain = requireEnv('SIGNET_TRUST_DOMAIN')
  // Captured for parity with keep/herald/tower's standard bootstrap
  // surface (Story 003's acceptance criteria names it explicitly), though
  // chronicle has no admin-scoped signet client of its own to hand it to --
  // unlike keep/herald, chronicle needs no `SIGNET_ADMIN_TOKEN`-gated
  // GitOpsService access, only its own service bundle.
  void (process.env.SIGNET_ADMIN_ADDR ?? signetAddr)

  const workload = await dialWorkload({ address: signetAddr, trustDomain })

  let bundleResponse: { bundle?: Record<string, unknown>, configVersion: number }
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

  let config: ChronicleConfig
  try {
    config = resolveConfigFromBundle(bundle, secrets)
  } catch (err) {
    workload.close()
    throw err
  }

  return {
    config,
    signet: { workload, namespace, service, configVersion: bundleResponse.configVersion },
  }
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

  const { config, signet } = await loadConfig(logger)

  const clickhouse = new RealClickHouseClient({
    url: config.clickhouse.url,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
    database: config.clickhouse.database,
    queryTimeoutMs: config.reporting.queryTimeoutMs,
  })
  // Read once at table-creation/migration time to build the `TTL` clause
  // (Story 001) -- not a live-reloaded value.
  await clickhouse.ensureSchema(config.retentionMonths)

  const consumer = await buildConsumer({
    url: config.rabbitmq.url,
    clickhouse,
    logger,
  })

  const app = await buildApp({ clickhouse, config, logger: true })
  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  await app.listen({ port, host: '0.0.0.0' })
  logger.info({ port, signetConfigured: Boolean(signet) }, 'chronicle listening')

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'chronicle shutting down')
    await app.close()
    await consumer.close()
    await clickhouse.close()
    signet?.workload.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Signet-Configured Mode only: same coordinated-restart-on-bundle-change
  // posture keep/herald/tower use -- a bundle change triggers a clean
  // shutdown and lets Kubernetes restart into a fresh fetch. `shutdown`
  // above is already idempotent (the `shuttingDown` guard), so this can
  // safely race an operator-issued SIGTERM without extra coordination.
  if (signet) {
    waitForRestart(signet.workload.client, signet.namespace, signet.service, 30, 10_000)
      .then(async (lock) => {
        logger.info('signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart')
        await shutdown('signet-bundle-change')
        await lock.release()
      })
      .catch((err) => {
        logger.error({ err }, 'waitForRestart failed')
      })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
