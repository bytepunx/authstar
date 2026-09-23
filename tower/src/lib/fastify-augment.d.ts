import type { ConsequentApi } from './consequent-types.js'
import type { ContactStore } from './contact-store.js'
import type { SignetAdmin } from './signet-admin.js'
import type { Publisher } from './publisher.js'
import type { IdGenerator } from './ids.js'
import type { HeraldPayloadKey } from './herald-payload-crypto.js'
import type { ProvisioningConfig } from '../routes/provisioning.js'

declare module 'fastify' {
  interface FastifyInstance {
    consequent: ConsequentApi
    contactStore: ContactStore
    signetAdmin: SignetAdmin
    publisher: Publisher
    ids: IdGenerator
    provisioningConfig: ProvisioningConfig
    heraldPayloadKey: HeraldPayloadKey
    spiffeTrustDomain: string | undefined
  }
}
