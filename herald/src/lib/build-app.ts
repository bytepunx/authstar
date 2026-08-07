import Fastify, { type FastifyInstance } from 'fastify'
import type { ConsequentApi } from './consequent-types.js'
import { PayloadKeyring } from './payload-crypto.js'
import { UnsubscribeKeyring } from './unsubscribe-token.js'
import { CredentialStore } from './credential-store.js'
import type { SendAdapter } from './send-worker.js'
import registerCommunicationTypeRoutes from '../routes/communication-types.js'
import registerTemplateRoutes from '../routes/templates.js'
import registerCommunicationRoutes from '../routes/communications.js'
import registerOptOutRoutes from '../routes/opt-outs.js'
import registerSuppressionRoutes from '../routes/suppressions.js'
import registerSendingConfigRoutes from '../routes/sending-config.js'
import registerUnsubscribeRoutes from '../routes/unsubscribe.js'

export interface BuildAppOptions {
  consequent: ConsequentApi
  payloadKeyring?: PayloadKeyring
  unsubscribeKeyring?: UnsubscribeKeyring
  credentialStore?: CredentialStore
  // Defaults to an adapter that always fails closed -- a test/behavior app
  // that never configures one shouldn't silently pretend to send email.
  adapterFor?: (provider: string) => SendAdapter
  logger?: boolean
}

const failClosedAdapter: SendAdapter = {
  send: () => Promise.resolve({ success: false, error: { message: 'no send adapter configured', transient: false } }),
}

// A single place to assemble the fastify instance so behavior/e2e/integration
// tests (and the real server entrypoint) all build the app the same way,
// differing only in which `consequent` instance (in-memory vs. Postgres-
// backed) and which send adapter they hand in.
export default async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's own default AJV options set `removeAdditional: true` -- an
    // `additionalProperties: false` schema silently *strips* an unknown
    // field instead of rejecting the request (confirmed against
    // @fastify/ajv-compiler's defaults during tower's own pilot). Overridden
    // globally so it means what it says everywhere in this service.
    ajv: { customOptions: { removeAdditional: false } },
  })

  const payloadKeyring = options.payloadKeyring ?? new PayloadKeyring()
  const unsubscribeKeyring = options.unsubscribeKeyring ?? new UnsubscribeKeyring()
  const credentialStore = options.credentialStore ?? new CredentialStore()
  const adapterFor = options.adapterFor ?? (() => failClosedAdapter)

  app.decorate('consequent', options.consequent)
  app.decorate('payloadKeyring', payloadKeyring)
  app.decorate('unsubscribeKeyring', unsubscribeKeyring)
  app.decorate('credentialStore', credentialStore)
  app.decorate('sendWorkerDeps', {
    consequent: options.consequent,
    payloadKeyring,
    unsubscribeKeyring,
    adapterFor,
  })

  await app.register(registerCommunicationTypeRoutes)
  await app.register(registerTemplateRoutes)
  await app.register(registerCommunicationRoutes)
  await app.register(registerOptOutRoutes)
  await app.register(registerSuppressionRoutes)
  await app.register(registerSendingConfigRoutes)
  await app.register(registerUnsubscribeRoutes)

  return app
}
