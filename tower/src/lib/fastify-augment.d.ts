import type { ConsequentApi } from './consequent-types.js'

declare module 'fastify' {
  interface FastifyInstance {
    consequent: ConsequentApi
  }
}
