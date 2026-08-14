import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dialWorkload, waitForRestart } from '@bytepunx/signet-client'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import amqplib from 'amqplib'
import buildApp from './lib/build-app.js'
import buildCommsConsumer, { type Consumer as CommsConsumer } from './lib/build-comms-consumer.js'
import buildContactLifecycleConsumer, { type Consumer as ContactLifecycleConsumer } from './lib/build-contact-lifecycle-consumer.js'
import { createAmqpPublisher } from './lib/publisher.js'
import { PayloadKeyring, type PersistedPayloadKeyGeneration } from './lib/payload-crypto.js'
import { UnsubscribeKeyring, type PersistedUnsubscribeKeyGeneration } from './lib/unsubscribe-token.js'
import { createSignetAdmin } from './lib/signet-admin.js'
import { seedBuiltInTemplates } from './lib/seed-templates.js'

// Production entrypoint. Follows the exact fetch-once/watch/restart-lock
// pattern tower's own `src/server.ts` established for this stack (signet
// bundle fetch via `dialWorkload` + `GetServiceBundle` -> real
// `consequent-postgres` adapters -> real `amqplib` connection -> fastify
// app start -> race `SIGTERM` against `waitForRestart`'s coordinated-
// restart lock) -- see that file's own header comment for the fuller
// rationale, unchanged here.
//
// NOT LIVE-VALIDATED in this pass -- no `kluster up --profile authstar`
// cluster was exercised against this file, same scope note tower's own
// entrypoint carries. Every I/O dependency this file wires (signet,
// Postgres, RabbitMQ) is exercised for real only indirectly: Postgres via
// `spec/integration/herald.integration.spec.ts` (real `consequent-postgres`
// adapters), RabbitMQ via `spec/integration/rabbitmq.integration.spec.ts`
// (real `amqplib`, via `build-comms-consumer.ts`/
// `build-contact-lifecycle-consumer.ts`, both of which this file also
// uses) -- this file itself, and the signet dial/watch/restart-lock
// sequence specifically, have no test coverage, consistent with how
// TESTING.md scopes every other authstar service's entrypoint.
//
// Herald's own signet bundle schema (payload-encryption keypair,
// unsubscribe HMAC key, DB connection string, RabbitMQ credentials) is not
// named by any ADR yet -- ADR 0025/0032 both describe *that* herald needs
// signet-managed key material without specifying the bundle's actual field
// names. The `payloadKeyGenerations`/`unsubscribeKeyGenerations` secret
// names below are this file's own best-effort guess, not a contract
// anything else in this design has committed to -- if the bundle doesn't
// carry them (true of every environment today, since nothing populates
// them), this falls back to generating a fresh ephemeral keypair/HMAC key
// at boot, loudly logged, exactly like `payload-crypto.ts`/
// `unsubscribe-token.ts`'s own long-documented "signet isn't available in
// this dev environment" stand-in -- just now living in the one place a
// real bundle would actually override it.

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

function loadPayloadKeyring(secrets: Record<string, string>, log: (msg: string) => void): PayloadKeyring {
  const raw = secrets.payloadKeyGenerations
  if (!raw) {
    log('herald: no payloadKeyGenerations in signet bundle -- generating an ephemeral in-process keypair (see server.ts header comment)')
    return new PayloadKeyring()
  }
  try {
    const seed = JSON.parse(raw) as PersistedPayloadKeyGeneration[]
    if (!Array.isArray(seed) || seed.length === 0) throw new Error('empty')
    return new PayloadKeyring(seed)
  } catch (err) {
    log(`herald: payloadKeyGenerations in signet bundle was unusable (${(err as Error).message}) -- falling back to an ephemeral in-process keypair`)
    return new PayloadKeyring()
  }
}

function loadUnsubscribeKeyring(secrets: Record<string, string>, log: (msg: string) => void): UnsubscribeKeyring {
  const raw = secrets.unsubscribeKeyGenerations
  if (!raw) {
    log('herald: no unsubscribeKeyGenerations in signet bundle -- generating an ephemeral in-process HMAC key (see server.ts header comment)')
    return new UnsubscribeKeyring()
  }
  try {
    const seed = JSON.parse(raw) as PersistedUnsubscribeKeyGeneration[]
    if (!Array.isArray(seed) || seed.length === 0) throw new Error('empty')
    return new UnsubscribeKeyring(seed)
  } catch (err) {
    log(`herald: unsubscribeKeyGenerations in signet bundle was unusable (${(err as Error).message}) -- falling back to an ephemeral in-process HMAC key`)
    return new UnsubscribeKeyring()
  }
}

async function main(): Promise<void> {
  const namespace = requireEnv('SIGNET_NAMESPACE')
  const service = process.env.SIGNET_SERVICE ?? 'herald'
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
  if (!dbConnectionString) throw new Error('signet bundle missing dbConnectionString')
  if (!rabbitmqUrl) throw new Error('signet bundle missing rabbitmqUrl')
  // ADR 0081: herald's own narrow, self-bundle-scoped GitOpsService admin
  // token, and the shared operator-token value (ADR 0021/0045) -- same
  // delivery pattern tower's own tokens use, herald just receives both
  // for the first time here.
  const signetAdminToken = secrets.signetAdminToken ?? requireEnv('SIGNET_ADMIN_TOKEN')
  const operatorToken = secrets.operatorToken ?? ''

  // eslint-disable-next-line no-console
  const bootLog = (msg: string) => console.warn(msg)
  const payloadKeyring = loadPayloadKeyring(secrets, bootLog)
  const unsubscribeKeyring = loadUnsubscribeKeyring(secrets, bootLog)

  const pgAdapters = initializePostgresAdapters({ connectionString: dbConnectionString })
  // Same structural-vs-nominal `consequent-postgres`/`consequent` adapter
  // type friction tower's own `server.ts` casts at this one boundary --
  // see that file's comment for the fuller explanation, unchanged here.
  const consequent = await initializeConsequent({
    actors: actorsPath,
    actorStore: pgAdapters.actor as never,
    eventStore: pgAdapters.event as never,
    searchAdapter: pgAdapters.search as never,
    logging: { level: 'info' },
  })

  // Story 003's own "operational/deployment concern, not an API route" --
  // idempotent across restarts, see seed-templates.ts's own header.
  // eslint-disable-next-line no-console
  await seedBuiltInTemplates(consequent, (msg) => console.log(msg))

  // A dedicated connection/channel for herald's own outbound publishing
  // (`contact.purge.acknowledged`, ADR 0026) -- kept separate from the two
  // consumer connections below (`build-comms-consumer.ts`/
  // `build-contact-lifecycle-consumer.ts` each open their own), same
  // one-connection-per-concern posture tower's `server.ts` uses for its
  // single combined connection, just split three ways here since herald
  // has two independently-closeable consumers plus a publisher.
  const publisherConnection = await amqplib.connect(rabbitmqUrl)
  const publisherChannel = await publisherConnection.createChannel()
  await publisherChannel.assertExchange('authstar', 'topic', { durable: true })
  const publisher = createAmqpPublisher(publisherChannel, 'authstar')

  // `adapterFor` deliberately omitted -- `buildApp`'s own default
  // (`failClosedAdapter`) already covers "no real SMTP/SES adapter exists
  // in this pass" (ADR 0032, see TESTING.md) correctly: every send attempt
  // fails closed with a clear error rather than silently pretending to
  // send, and retries/dead-lettering behave exactly as they would for any
  // other permanent send failure.
  // ADR 0089's tenant-JWKS resolution needs herald's own copy of
  // `baseDomain` -- same bundle field name tower's `ProvisioningConfig.
  // baseDomain` reads, same fallback.
  const baseDomain = (bundle.baseDomain as string | undefined) ?? 'authstar.app'

  const signetAdmin = createSignetAdmin({ address: adminAddress, token: signetAdminToken, namespace })

  const app = await buildApp({
    consequent,
    payloadKeyring,
    unsubscribeKeyring,
    baseDomain,
    signetAdmin,
    operatorToken,
    logger: true,
  })

  const commsConsumer: CommsConsumer = await buildCommsConsumer({
    url: rabbitmqUrl,
    deps: app.sendWorkerDeps,
  })
  const contactLifecycleConsumer: ContactLifecycleConsumer = await buildContactLifecycleConsumer({
    url: rabbitmqUrl,
    deps: { consequent, publisher },
  })

  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`herald listening on :${port} (signet config version ${bundleResponse.configVersion})`)

  // Race our own shutdown signal against signet's coordinated-restart wait
  // -- identical reasoning to tower's `server.ts`: a stuck `waitForRestart`
  // can never block an operator-issued SIGTERM.
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

  await commsConsumer.close()
  await contactLifecycleConsumer.close()
  await publisherChannel.close()
  await publisherConnection.close()
  await pgAdapters.close()
  workload.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
