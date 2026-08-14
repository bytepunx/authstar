import type { ConsequentApi } from './consequent-types.js'
import type { PayloadKeyring } from './payload-crypto.js'
import type { UnsubscribeKeyring } from './unsubscribe-token.js'
import type { CredentialStore } from './credential-store.js'
import type { SendWorkerDeps } from './send-worker.js'
import type { SignetAdmin } from './signet-admin.js'

declare module 'fastify' {
  interface FastifyInstance {
    consequent: ConsequentApi
    payloadKeyring: PayloadKeyring
    unsubscribeKeyring: UnsubscribeKeyring
    credentialStore: CredentialStore
    signetAdmin: SignetAdmin
    operatorToken: string
    sendWorkerDeps: SendWorkerDeps
  }
}
