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
import { createAmqpEntitlementPublisher, ENTITLEMENT_EXCHANGE } from './lib/amqp-entitlement-publisher.js'
import { createInMemorySequenceProvider } from './lib/entitlement-publisher.js'

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
  // In-memory only -- `entitlement-publisher.ts`'s own `SequenceProvider`
  // doc comment and TESTING.md both flag this as not durable across a
  // restart; no keep story specifies the backing mechanism yet (a
  // dedicated `entitlementSequence` actor, or a Postgres counter table),
  // so nothing to wire here beyond what already exists. Left as a
  // documented follow-up, not silently glossed over.
  const sequences = createInMemorySequenceProvider()

  const stripeClients = createStripeClientFactory()
  const stripeConfig = createSignetStripeConfigStore({ address: adminAddress, token: signetAdminToken, initialSecrets: secrets })

  // The tower-sourced role reference cache (ADR 0047) needs a startup
  // backfill against tower plus a periodic re-run to stay fresh -- that
  // poller is out of scope for this pilot slice (TESTING.md: "no running
  // tower to poll in these tests," and no keep story specifies the
  // mechanism yet). Boots with an empty snapshot rather than blocking
  // startup on unbuilt work; every `grantedRoles` validation this cache
  // backs will reject until a real poller is built and wired in here.
  const roleCache = createRoleReferenceCache({})

  // ADR 0089's tenant-JWKS resolution needs keep's own copy of `baseDomain`
  // -- same bundle field name tower's `ProvisioningConfig.baseDomain`
  // reads, same fallback.
  const baseDomain = (bundle.baseDomain as string | undefined) ?? 'authstar.app'

  const app = await buildApp({
    consequent,
    stripeClients,
    stripeConfig,
    roleCache,
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
