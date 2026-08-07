import buildApp from './lib/build-app.js'
import { createAmqpPublisher } from './lib/amqp-publisher.js'

// Real entrypoint. Production config (the RabbitMQ URL, the client-event
// allowlist, rate-limit thresholds) belongs in signet per this project's
// hard dependency on it (root CLAUDE.md) -- no signet-client wiring exists
// yet for lookout (no config story has specified it), so this reads plain
// env vars for now as the smallest thing that makes the service actually
// runnable. Swapping the source is a change to this file only; buildApp
// itself has no knowledge of where its inputs came from.
const PORT = Number(process.env.PORT ?? 3000)
const RABBITMQ_URL = process.env.LOOKOUT_RABBITMQ_URL ?? 'amqp://localhost'

async function main(): Promise<void> {
  const publisher = await createAmqpPublisher({ url: RABBITMQ_URL })
  const app = await buildApp({ publisher, logger: true })

  process.on('SIGTERM', async () => {
    await app.close()
    await publisher.close()
    process.exit(0)
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
