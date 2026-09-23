import { AuthstarJwtError } from './errors.js'

/**
 * Extracts the token from a raw `Authorization` header value. Framework-agnostic on
 * purpose -- every HTTP framework's middleware needs this exact one-liner, so it lives
 * here once instead of being copy-pasted into every framework package.
 */
export function extractBearerToken(authorizationHeader: string | undefined | null): string {
  if (!authorizationHeader) {
    throw new AuthstarJwtError('malformed', 'missing Authorization header')
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader)
  if (!match || !match[1]) {
    throw new AuthstarJwtError('malformed', 'Authorization header is not a Bearer token')
  }
  return match[1]
}
