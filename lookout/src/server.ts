import { dialWorkload } from '@bytepunx/signet-client'
import buildApp from './lib/build-app.js'
import { createAmqpPublisher } from './lib/amqp-publisher.js'
import { isSignetConfigured, resolveEnvOnlyRabbitmqUrl, resolveSignetRabbitmqUrl, decodeBundleSecrets } from './lib/signet-config.js'

// Real entrypoint. Per ADR 0102 / Story 002: presence of `SIGNET_ADDR`
// alone gates Signet-Configured Mode (dial signet, source `rabbitmqUrl`
// exclusively from the fetched bundle, fail loud if it's missing) vs.
// Env-Only Mode (today's plain `LOOKOUT_RABBITMQ_URL` env read, unchanged).
// The actual precedence/fail-loud decision logic lives in
// `lib/signet-config.ts` so it's unit-testable; this file stays a thin,
// untested entrypoint wiring real I/O, matching keep/herald's own
// `src/server.ts` convention.
//
// No restart-lock/watch loop (`waitForRestart`) here -- out of scope per
// Story 002, which only requires the bundle fetch itself, not
// keep/herald's fuller fetch-once/watch/restart-on-change lifecycle.
//
// `PORT` stays a plain env read unconditionally, outside the Env-Only vs.
// Signet-Configured branch -- it's infra-level, not tenant/operator
// config, and out of scope for signet per ADR 0102's product-default
// carve-out.
const PORT = Number(process.env.PORT ?? 3000)

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

async function resolveRabbitmqUrl(): Promise<string> {
  if (!isSignetConfigured(process.env)) {
    return resolveEnvOnlyRabbitmqUrl(process.env)
  }

  const namespace = requireEnv('SIGNET_NAMESPACE')
  const service = process.env.SIGNET_SERVICE ?? 'lookout'
  const address = requireEnv('SIGNET_ADDR')
  const trustDomain = requireEnv('SIGNET_TRUST_DOMAIN')

  const workload = await dialWorkload({ address, trustDomain })
  try {
    const bundleResponse = await new Promise<{ bundle?: Record<string, unknown>, configVersion: number }>((resolve, reject) => {
      workload.client.getServiceBundle({ namespace, service }, (err, resp) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })

    const bundle = bundleResponse.bundle ?? {}
    const secrets = decodeBundleSecrets(bundle)
    return resolveSignetRabbitmqUrl(bundle, secrets)
  } finally {
    workload.close()
  }
}

async function main(): Promise<void> {
  const rabbitmqUrl = await resolveRabbitmqUrl()
  const publisher = await createAmqpPublisher({ url: rabbitmqUrl })
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
