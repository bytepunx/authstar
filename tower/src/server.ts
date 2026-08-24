import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dialWorkload, waitForRestart } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import amqplib from 'amqplib'
import { Pool } from 'pg'
import buildApp from './lib/build-app.js'
import { createPgContactStore, ensureContactsSchema } from './lib/contact-store.js'
import { createSignetAdmin } from './lib/signet-admin.js'
import { createAmqpPublisher } from './lib/publisher.js'
import { createIdGenerator } from './lib/ids.js'
import { startEntitlementConsumer } from './lib/entitlement-consumer.js'
import { startErasureAckConsumer } from './lib/erasure-ack-consumer.js'
import { createEphemeralHeraldKey, heraldKeyFromPem, type HeraldPayloadKey } from './lib/herald-payload-crypto.js'
import { fetchServerCredentials, watchSVIDRotation } from './lib/spiffe-mtls.js'
import type { ProvisioningConfig } from './routes/provisioning.js'

// Production entrypoint. Follows the fetch-once/watch/restart-lock pattern
// documented in `signet-clients/typescript/examples/echo/index.ts` and
// mirrored conceptually from portcullis's own live-validated Rust bootstrap
// (`BootstrapEnv` -> `dial` -> `fetch` -> serve -> race shutdown against
// `wait_for_restart`, see `~/git/authstar/portcullis/TESTING.md`): no
// config files, no static env-var configuration beyond the handful of
// bootstrap coordinates signet itself needs to be dialed at all, no
// hot-reload -- a bundle change triggers a clean process exit and lets
// Kubernetes restart into a fresh fetch.
//
// NOT LIVE-VALIDATED in this pass -- no `kluster up --profile signet`
// cluster was exercised against this file (see TESTING.md and the
// project's final report for the explicit scope note). Every I/O
// dependency this file wires (signet, Postgres, RabbitMQ, and now the
// SPIFFE Workload API via `fetchServerCredentials`) is exercised for
// real by this repo's own test tiers only indirectly, through the
// injectable interfaces (`ContactStore`, `SignetAdmin`, `Publisher`,
// `ChannelLike`) those tiers fake -- this file itself has no test coverage,
// consistent with how `TESTING.md` scopes every other authstar service's
// entrypoint.

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

// ADR 0025/0081: herald's own `POST /operator/rotate-keys` pushes its
// current payload-encryption public key here as `heraldPayloadPublicKey`
// (`{version, publicKeyPem}`, herald's `signet-admin.ts`/
// `operator-rotate-keys.ts`) -- the "public key distributed via signet"
// mechanism ADR 0025 itself named, actually wired for the first time here.
// Falls back to an ephemeral throwaway key (same as ever) only until
// herald's rotate-keys route has been called at least once for this
// installation.
function loadHeraldPayloadKey(secrets: Record<string, string>, log: (msg: string) => void): HeraldPayloadKey {
  const raw = secrets.heraldPayloadPublicKey
  if (!raw) {
    log('no signet-sourced herald payload-encryption public key configured yet -- using an ephemeral throwaway key; comms.* events published from this process are not decryptable by a real herald instance until herald\'s POST /operator/rotate-keys has been called at least once (ADR 0025/0081)')
    return createEphemeralHeraldKey()
  }
  try {
    const { version, publicKeyPem } = JSON.parse(raw) as { version: number, publicKeyPem: string }
    return heraldKeyFromPem(version, publicKeyPem)
  } catch (err) {
    log(`heraldPayloadPublicKey in signet bundle was unusable (${(err as Error).message}) -- falling back to an ephemeral throwaway key`)
    return createEphemeralHeraldKey()
  }
}

async function main(): Promise<void> {
  const namespace = requireEnv('SIGNET_NAMESPACE')
  const service = process.env.SIGNET_SERVICE ?? 'tower'
  const address = requireEnv('SIGNET_ADDR')
  const trustDomain = requireEnv('SIGNET_TRUST_DOMAIN')
  const adminAddress = process.env.SIGNET_ADMIN_ADDR ?? address

  const controller = new AbortController()
  const onSignal = () => controller.abort(new Error('shutdown signal received'))
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  const workload = await dialWorkload({ address, trustDomain })

  // Same ambient `SPIFFE_ENDPOINT_SOCKET` Workload API socket `dialWorkload`
  // itself defaults to when its own `address`/`trustDomain` opts are for
  // signet specifically -- no separate credential/env story needed for
  // tower's own server-side X.509-SVID.
  const spiffeCredentials = await fetchServerCredentials()

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
  const signetAdminToken = secrets.signetAdminToken ?? requireEnv('SIGNET_ADMIN_TOKEN')
  const contactHashPepper = secrets.contactHashPepper
  if (!dbConnectionString) throw new Error('signet bundle missing dbConnectionString')
  if (!rabbitmqUrl) throw new Error('signet bundle missing rabbitmqUrl')
  if (!contactHashPepper) throw new Error('signet bundle missing contactHashPepper secret')

  const provisioningConfig: ProvisioningConfig = {
    selfServiceEnabled: Boolean((bundle.provisioning as Record<string, unknown> | undefined)?.selfServiceEnabled ?? false),
    operatorToken: secrets.operatorToken ?? '',
    defaultProvider: ((bundle.provisioning as Record<string, unknown> | undefined)?.defaultProvider as ProvisioningConfig['defaultProvider'] | undefined) ?? {
      name: '', clientId: '', discoveryUrl: '', scope: [],
    },
    defaultProviderClientSecret: secrets['default-provider-client-secret'] ?? '',
  }

  const pgPool = new Pool({ connectionString: dbConnectionString })
  await ensureContactsSchema(pgPool)

  const pgAdapters = initializePostgresAdapters({ connectionString: dbConnectionString })
  // `consequent-postgres`'s own adapter types (`ActorStore`/`EventStore`/
  // `SearchAdapter`, concrete `string`-keyed) are structurally compatible
  // at runtime with `consequent`'s own looser `unknown`-keyed adapter
  // interfaces (confirmed by the existing integration test tier wiring
  // them together the same way) but not nominally assignable under
  // `--strict` -- the same friction the 2.0.1/2.0.4 `find()` fix this
  // pilot slice depends on didn't change. Cast at this one boundary rather
  // than loosening either package's own types.
  const consequent = await initializeConsequent({
    actors: actorsPath,
    actorStore: pgAdapters.actor as never,
    eventStore: pgAdapters.event as never,
    searchAdapter: pgAdapters.search as never,
    logging: { level: 'info' },
  })

  const amqpConnection = await amqplib.connect(rabbitmqUrl)
  const amqpChannel = await amqpConnection.createChannel()
  await amqpChannel.assertExchange('authstar', 'topic', { durable: true })

  const entitlementQueue = await amqpChannel.assertQueue('tower.entitlement', { durable: true })
  await amqpChannel.bindQueue(entitlementQueue.queue, 'authstar', 'entitlement.#')
  await startEntitlementConsumer(amqpChannel, entitlementQueue.queue, { consequent })

  const ackQueue = await amqpChannel.assertQueue('tower.contact-purge-ack', { durable: true })
  await amqpChannel.bindQueue(ackQueue.queue, 'authstar', 'contact.purge.acknowledged')
  await startErasureAckConsumer(amqpChannel, ackQueue.queue, { consequent })

  const publisher = createAmqpPublisher(amqpChannel, 'authstar')
  const signetAdmin = createSignetAdmin({ address: adminAddress, token: signetAdminToken, namespace })
  const contactStore = createPgContactStore(pgPool, contactHashPepper)
  const ids = createIdGenerator(service)
  // eslint-disable-next-line no-console
  const heraldPayloadKey = loadHeraldPayloadKey(secrets, (msg) => console.warn(msg))

  const app = await buildApp({
    consequent,
    contactStore,
    signetAdmin,
    publisher,
    ids,
    provisioningConfig,
    heraldPayloadKey,
    logger: true,
    tls: spiffeCredentials,
    spiffeTrustDomain: trustDomain,
  })

  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`tower listening on :${port} (signet config version ${bundleResponse.configVersion})`)
  watchSVIDRotation(app.server as unknown as { setSecureContext: (ctx: { cert: string; key: string; ca: string }) => void })

  // Race our own shutdown signal against signet's coordinated-restart wait
  // so a stuck `waitForRestart` (an anomaly portcullis's own live-cluster
  // testing found under real SPIFFE mTLS -- see TESTING.md) can never block
  // an operator-issued SIGTERM.
  //
  // Both branches can resolve close together (e.g. a signet bundle-change
  // restart racing an external SIGTERM) -- closeOnce ensures app.close() is
  // only ever invoked once, since Fastify's close() isn't safe to re-enter
  // while a prior call is still in flight (confirmed live: a concurrent
  // second call left the process hung after logging, never reaching
  // process.exit, until Kubernetes' liveness probe force-killed it).
  let closePromise: Promise<void> | undefined
  const closeOnce = (): Promise<void> => (closePromise ??= app.close())

  await Promise.race([
    waitForRestart(workload.client, namespace, service, 30, 10_000, { signal: controller.signal })
      .then(async (lock) => {
        app.log.info('signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart')
        await closeOnce()
        await lock.release()
      })
      .catch((err) => {
        if (controller.signal.aborted) return // expected: our own shutdown aborted the wait
        app.log.error({ err }, 'waitForRestart failed')
      }),
    new Promise<void>((resolve) => controller.signal.addEventListener('abort', () => resolve())).then(async () => {
      app.log.info('shutdown signal received -- closing')
      await closeOnce()
    }),
  ])

  await pgAdapters.close()
  await pgPool.end()
  await amqpChannel.close()
  await amqpConnection.close()
  workload.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
