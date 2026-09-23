export type AuthstarJwtErrorReason =
  | 'malformed'
  | 'expired'
  | 'signature-invalid'
  | 'unknown-kid'
  | 'wrong-audience'
  | 'wrong-issuer'
  | 'missing-claim'
  | 'key-resolution-failed'

/**
 * A single error type with a discriminated `reason`, not one class per failure mode --
 * lets middleware map failures to HTTP responses (expired/signature-invalid/unknown-kid
 * -> 401, key-resolution-failed -> 503, the rest -> 400) without a long instanceof chain.
 */
export class AuthstarJwtError extends Error {
  readonly reason: AuthstarJwtErrorReason

  constructor(reason: AuthstarJwtErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AuthstarJwtError'
    this.reason = reason
  }
}
