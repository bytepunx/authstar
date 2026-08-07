import type { FastifyReply, FastifyRequest } from 'fastify'
import { jwtVerify } from 'jose'

// Identical posture to herald (ADR 0034, applied to chronicle by Story
// 002): behind portcullis, authorized via `permissions` claims on the
// forwarded internal JWT, independently re-verified by chronicle on top of
// portcullis already gating access. No operator tier -- chronicle has no
// bootstrap problem to solve.

export interface AuthClaims {
  permissions?: string[]
  [key: string]: unknown
}

export function requirePermission(secret: string, permission: string) {
  const key = new TextEncoder().encode(secret)

  return async function verifyAndAuthorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' })
    }

    const token = header.slice('Bearer '.length)
    let claims: AuthClaims
    try {
      const { payload } = await jwtVerify(token, key)
      claims = payload as AuthClaims
    } catch {
      return reply.code(401).send({ error: 'invalid or expired token' })
    }

    const permissions = claims.permissions ?? []
    if (!permissions.includes(permission)) {
      return reply.code(403).send({ error: `missing required permission: ${permission}` })
    }

    request.authClaims = claims
  }
}
