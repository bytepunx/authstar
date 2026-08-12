export { default as authstarFastifyPlugin, type AuthstarFastifyOptions } from './plugin.js'
export {
  staticKeyProvider,
  jwksKeyProvider,
  AuthstarJwtError,
  type AuthstarJwtErrorReason,
  type InternalClaims,
  type EnrichmentStatus,
  type JWTVerifyGetKey,
} from '@bytepunx/authstar-core'
