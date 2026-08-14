import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import {
  verifyInternalJwt,
  extractBearerToken,
  AuthstarJwtError,
  type InternalClaims,
  type JWTVerifyGetKey,
} from '@bytepunx/authstar-core'

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The verified internal JWT's claims, set once auth succeeds. Undefined on any
     * route where `required: false` and no valid token was presented -- always check
     * for its presence rather than assuming it's set, even on a route you expect to be
     * authenticated (a misconfigured `required: false` elsewhere is a config error you
     * want to notice, not a null-deref you want to survive silently).
     */
    authstar?: InternalClaims
  }
}

export interface AuthstarFastifyOptions {
  /**
   * Resolves which tenant's verification key(s) to use for a given request --
   * portcullis's internal JWT carries no `iss`/`aud` in its payload (see
   * @bytepunx/authstar-core's README), so this plugin doesn't infer the tenant itself.
   * A service reached at a tenant-branded host can just return the same
   * `jwksKeyProvider`/`staticKeyProvider` result every time. A service with no such
   * signal (tower/keep/herald: one shared deployment for every tenant) should return
   * the same `perTenantJwksKeyProvider(baseDomain)` instance every time instead -- it
   * resolves the tenant itself, per request, from the token's own header (ADR 0089), so
   * this hook has nothing tenant-specific left to do.
   */
  getKeyForRequest: (request: FastifyRequest) => JWTVerifyGetKey | Promise<JWTVerifyGetKey>
  /**
   * true (default): missing/invalid tokens get a 401 automatically. false: verification
   * failures are swallowed and `request.authstar` is simply left undefined, so routes
   * that mix public and authenticated behavior can check it themselves.
   */
  required?: boolean
  /** Forwarded to verifyInternalJwt -- see its own doc comment. Default 5s. */
  clockToleranceSeconds?: number
}

function statusForReason(reason: AuthstarJwtError['reason']): number {
  return reason === 'key-resolution-failed' ? 503 : 401
}

const authstarFastifyPlugin: FastifyPluginAsync<AuthstarFastifyOptions> = async (fastify, options) => {
  const required = options.required ?? true

  fastify.decorateRequest('authstar', undefined)

  fastify.addHook('preHandler', async (request, reply) => {
    let token: string
    try {
      token = extractBearerToken(request.headers.authorization)
    } catch (err) {
      if (!required) return
      const reason = err instanceof AuthstarJwtError ? err.reason : 'malformed'
      await reply.code(statusForReason(reason)).send({ error: 'unauthorized', reason })
      return
    }

    try {
      const getKey = await options.getKeyForRequest(request)
      request.authstar = await verifyInternalJwt(token, getKey, {
        clockToleranceSeconds: options.clockToleranceSeconds,
      })
    } catch (err) {
      if (!required) return
      const reason = err instanceof AuthstarJwtError ? err.reason : 'malformed'
      await reply.code(statusForReason(reason)).send({ error: 'unauthorized', reason })
    }
  })
}

export default fp(authstarFastifyPlugin, {
  name: '@bytepunx/authstar-fastify',
})
