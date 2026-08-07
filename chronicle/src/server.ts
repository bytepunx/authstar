import pino from 'pino'
import buildApp from './lib/build-app.js'
import buildConsumer from './consumer/build-consumer.js'
import RealClickHouseClient from './lib/clickhouse-client.js'
import { loadConfig } from './lib/config.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

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
  logger.info({ port }, 'chronicle listening')

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'chronicle shutting down')
    await app.close()
    await consumer.close()
    await clickhouse.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
