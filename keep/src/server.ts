import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dialWorkload, waitForRestart } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import amqplib from 'amqplib'
import buildApp from './lib/build-app.js'
import { createStripeClientFactory } from './lib/stripe-client.js'
import { createSignetStripeConfigStore } from './lib/signet-stripe-config-store.js'
import { createRoleReferenceCache } from './lib/role-reference-cache.js'
import { startRoleReferenceConsumer } from './lib/role-reference-consumer.js'
import { createTowerReferenceClient, createRoleReferenceBackfill } from './lib/role-reference-backfill.js'
import { createAmqpEntitlementPublisher, ENTITLEMENT_EXCHANGE } from './lib/amqp-entitlement-publisher.js'
import { createConsequentSequenceProvider } from './lib/consequent-sequence-provider.js'

// ADR 0047's periodic safety-net re-run interval for the role-reference
// backfill (`role-reference-backfill.ts`'s `refreshAll`) -- re-checks every
// tenant already backfilled at least once, catching a missed RabbitMQ
// delivery. Not configurable via signet -- this is an operational tuning
// knob, not tenant-facing config, same posture as this codebase's other
// fixed intervals (none exist yet to compare against, but matches
// `waitForRestart`'s own fixed-constant polling interval below).
const ROLE_REFERENCE_REFRESH_INTERVAL_MS = 5 * 60_000

// Production entrypoint. Follows the exact fetch-once/watch/restart-lock
// pattern tower's own `src/server.ts` establishes for this codebase (itself
// following `signet-clients/typescript/examples/echo/index.ts` and
// portcullis's live-validated Rust bootstrap): no config files, no static
// env-var configuration beyond the handful of bootstrap coordinates signet
// itself needs to be dialed at all, no hot-reload -- a bundle change
// triggers a clean process exit and lets Kubernetes restart into a fresh
// fetch.
//
// NOT LIVE-VALIDATED in this pass -- no `kluster up --profile authstar`
// cluster was exercised against this file (see TESTING.md and this
// project's final report for the explicit scope note). Every I/O
// dependency this file wires (signet, Postgres, RabbitMQ, Stripe) is
// exercised for real by this repo's own test tiers only indirectly,
// through the injectable interfaces (`StripeClientFactory`,
// `StripeConfigStore`, `EntitlementPublisher`, `RoleReferenceCache`) those
// tiers fake or (for Postgres/RabbitMQ, in `spec/integration/`) exercise
// against real, disposable infrastructure -- this file itself has no test
// coverage, consistent with how `TESTING.md` scopes tower's own entrypoint
// the same way.

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

  const controller = new AbortController()
  const onSignal = () => controller.abort(new Error('shutdown signal received'))
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  const workload = await dialWorkload({ address, trustDomain })

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

  const dbConnectionString = (bundle.dbConnectionString as string | undefined) ?? secrets.dbConnectionString
  const rabbitmqUrl = (bundle.rabbitmqUrl as string | undefined) ?? secrets.rabbitmqUrl
  // ADR 0052: keep's own narrow, self-bundle-scoped GitOpsService admin
  // token -- delivered as a secret in keep's own bundle, same delivery
  // pattern as tower's own token (ADR 0011), just narrower in what it can
  // reach.
  const signetAdminToken = secrets.signetAdminToken ?? requireEnv('SIGNET_ADMIN_TOKEN')
  if (!dbConnectionString) throw new Error('signet bundle missing dbConnectionString')
  if (!rabbitmqUrl) throw new Error('signet bundle missing rabbitmqUrl')

  const pgAdapters = initializePostgresAdapters({ connectionString: dbConnectionString })
  // `consequent-postgres`'s own adapter types (`ActorStore`/`EventStore`/
  // `SearchAdapter`, concrete `string`-keyed) are structurally compatible
  // at runtime with `consequent`'s own looser `unknown`-keyed adapter
  // interfaces (confirmed by this repo's own integration test tier wiring
  // them together the same way, and by tower's own `src/server.ts` doing
  // the identical cast) but not nominally assignable under `--strict`.
  // Cast at this one boundary rather than loosening either package's own
  // types.
  const consequent = await initializeConsequent({
    actors: actorsPath,
    actorStore: pgAdapters.actor as never,
    eventStore: pgAdapters.event as never,
    searchAdapter: pgAdapters.search as never,
    logging: { level: 'info' },
  })

  const amqpConnection = await amqplib.connect(rabbitmqUrl)
  const amqpChannel = await amqpConnection.createChannel()
  // Same exchange, same topic/durable settings tower's own `src/server.ts`
  // asserts -- `assertExchange` is idempotent against matching options, so
  // whichever of keep/tower boots first creates it and the other's
  // assertion is a no-op confirmation, never a conflict.
  await amqpChannel.assertExchange(ENTITLEMENT_EXCHANGE, 'topic', { durable: true })

  const entitlements = createAmqpEntitlementPublisher(amqpChannel, ENTITLEMENT_EXCHANGE)
  // Durable, backed by the `entitlementSequence` consequent actor --
  // survives a restart (was in-memory-only, resetting to zero on every
  // one). See `consequent-sequence-provider.ts`'s own header comment.
  const sequences = createConsequentSequenceProvider(consequent)

  const stripeClients = createStripeClientFactory()
  const stripeConfig = createSignetStripeConfigStore({ address: adminAddress, token: signetAdminToken, initialSecrets: secrets })

  // ADR 0047's role reference cache -- now real, not the always-empty
  // stub this used to boot with. Kept current two ways: a live RabbitMQ
  // consumer on tower's `application.*`/`roleDefinition.*` events (below),
  // and a per-tenant backfill against tower's own list endpoints
  // (`role-reference-backfill.ts`'s own header comment explains why this
  // is per-tenant-on-first-touch rather than one eager, whole-installation
  // sweep -- tower has no endpoint to enumerate every tenant).
  const towerBaseUrl = (bundle.towerBaseUrl as string | undefined) ?? secrets.towerBaseUrl
  if (!towerBaseUrl) throw new Error('signet bundle missing towerBaseUrl')
  const roleCache = createRoleReferenceCache()
  const roleBackfill = createRoleReferenceBackfill(roleCache, createTowerReferenceClient(towerBaseUrl))

  const roleReferenceQueue = await amqpChannel.assertQueue('keep.role-reference', { durable: true })
  await amqpChannel.bindQueue(roleReferenceQueue.queue, ENTITLEMENT_EXCHANGE, 'application.#')
  await amqpChannel.bindQueue(roleReferenceQueue.queue, ENTITLEMENT_EXCHANGE, 'roleDefinition.#')
  await startRoleReferenceConsumer(amqpChannel, roleReferenceQueue.queue, roleCache)

  // ADR 0047's "periodically re-run as a safety net" -- `unref()` so this
  // timer never keeps the process alive on its own, cleared explicitly on
  // shutdown below regardless.
  const roleReferenceRefreshTimer = setInterval(() => {
    roleBackfill.refreshAll().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('role reference cache periodic refresh failed', err)
    })
  }, ROLE_REFERENCE_REFRESH_INTERVAL_MS)
  roleReferenceRefreshTimer.unref()

  // ADR 0089's tenant-JWKS resolution needs keep's own copy of `baseDomain`
  // -- same bundle field name tower's `ProvisioningConfig.baseDomain`
  // reads, same fallback.
  const baseDomain = (bundle.baseDomain as string | undefined) ?? 'authstar.app'

  const app = await buildApp({
    consequent,
    stripeClients,
    stripeConfig,
    roleCache,
    roleBackfill,
    entitlements,
    sequences,
    baseDomain,
    logger: true,
  })

  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`keep listening on :${port} (signet config version ${bundleResponse.configVersion})`)

  // Race our own shutdown signal against signet's coordinated-restart wait
  // so a stuck `waitForRestart` (an anomaly portcullis's own live-cluster
  // testing found under real SPIFFE mTLS -- see tower's TESTING.md) can
  // never block an operator-issued SIGTERM.
  await Promise.race([
    waitForRestart(workload.client, namespace, service, 30, 10_000, { signal: controller.signal })
      .then(async (lock) => {
        app.log.info('signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart')
        await app.close()
        await lock.release()
      })
      .catch((err) => {
        if (controller.signal.aborted) return // expected: our own shutdown aborted the wait
        app.log.error({ err }, 'waitForRestart failed')
      }),
    new Promise<void>((resolve) => controller.signal.addEventListener('abort', () => resolve())).then(async () => {
      app.log.info('shutdown signal received -- closing')
      await app.close()
    }),
  ])

  clearInterval(roleReferenceRefreshTimer)
  await pgAdapters.close()
  await amqpChannel.close()
  await amqpConnection.close()
  workload.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
