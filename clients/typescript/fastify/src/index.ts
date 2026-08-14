export { default as authstarFastifyPlugin, type AuthstarFastifyOptions } from './plugin.js'
export {
  staticKeyProvider,
  jwksKeyProvider,
  perTenantJwksKeyProvider,
  type PerTenantJwksKeyProviderOptions,
  AuthstarJwtError,
  type AuthstarJwtErrorReason,
  type InternalClaims,
  type EnrichmentStatus,
  type JWTVerifyGetKey,
} from '@bytepunx/authstar-core'
