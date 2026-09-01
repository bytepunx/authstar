import type { ChronicleConfig } from './config.js'

// ADR 0102 / Story 003: once chronicle is in Signet-Configured Mode
// (`SIGNET_ADDR` set -- see `server.ts`), every non-bootstrap setting is
// sourced exclusively from the fetched bundle/secrets. A field this module
// expects that's missing from the bundle is a startup failure naming the
// exact missing field/secret -- never a silent fallback to an env var, and
// never a hardcoded literal default (in particular, `DEV_ONLY_INTERNAL_JWT_SECRET`
// from config.ts is never imported or referenced here, so it is structurally
// unreachable from this path). This mirrors tower's own
// `signet-bundle-config.ts` (Story 016), which the same ADR drove.
//
// Kept as pure functions operating on an already-fetched bundle/secrets
// object, deliberately independent of the signet dial itself, so this
// resolution/fail-loud logic is fully unit-testable without a real signet
// server -- `server.ts`'s `main()` stays a thin, untested wiring shell
// (see TESTING.md's scope note on entrypoints, and keep/herald's own
// `server.ts` header comments for the same convention).

function missingFieldError(field: string): Error {
  return new Error(`signet bundle missing ${field} -- provision it in signet`)
}

function requireBundleString(bundle: Record<string, unknown>, field: string): string {
  const value = bundle[field]
  if (typeof value !== 'string' || value === '') throw missingFieldError(field)
  return value
}

function requireSecretString(secrets: Record<string, string>, field: string): string {
  const value = secrets[field]
  if (!value) throw missingFieldError(`${field} secret`)
  return value
}

function requireBundleInt(bundle: Record<string, unknown>, field: string): number {
  const raw = bundle[field]
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) throw missingFieldError(field)
  return parsed
}

// `bundle.secrets` arrives base64-encoded (same convention as keep/herald's
// own `decodeBundleSecrets` in their `server.ts`) -- decoded once here so
// both `server.ts` and this module's tests share one implementation instead
// of each service re-deriving its own copy.
export function decodeBundleSecrets(bundle: Record<string, unknown> | undefined): Record<string, string> {
  const secrets = (bundle?.secrets as Record<string, string> | undefined) ?? {}
  const decoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    decoded[key] = Buffer.from(value, 'base64').toString('utf8')
  }
  return decoded
}

// Sources the entire `ChronicleConfig` from a fetched signet bundle +
// decoded secrets. Field mapping (Story 003):
//   secrets.clickhousePassword       -> clickhouse.password
//   bundle.rabbitmqUrl ?? secrets.rabbitmqUrl -> rabbitmq.url
//   secrets.internalJwtSecret        -> internalJwtSecret
//   bundle.clickhouseUrl/Username/Database, retentionMonths,
//   maxDateRangeDays, queryTimeoutMs, rateLimitMax, rateLimitWindowMs
//                                     -> corresponding plain config fields
// Every field is required -- absence throws naming the exact field, per
// ADR 0102's fail-loud rule. No field here has a product-level default the
// way portcullis's `WebUpstreamConfig.timeout` does (ADR 0102 explicitly
// distinguishes that case); every one of these is either a secret or
// operator-provisioned config chronicle's bundle is expected to carry.
export function resolveConfigFromBundle(bundle: Record<string, unknown>, secrets: Record<string, string>): ChronicleConfig {
  const rabbitmqUrl =
    typeof bundle.rabbitmqUrl === 'string' && bundle.rabbitmqUrl !== '' ? bundle.rabbitmqUrl : requireSecretString(secrets, 'rabbitmqUrl')

  return {
    clickhouse: {
      url: requireBundleString(bundle, 'clickhouseUrl'),
      username: requireBundleString(bundle, 'clickhouseUsername'),
      password: requireSecretString(secrets, 'clickhousePassword'),
      database: requireBundleString(bundle, 'clickhouseDatabase'),
    },
    rabbitmq: {
      url: rabbitmqUrl,
    },
    retentionMonths: requireBundleInt(bundle, 'retentionMonths'),
    internalJwtSecret: requireSecretString(secrets, 'internalJwtSecret'),
    reporting: {
      maxDateRangeDays: requireBundleInt(bundle, 'maxDateRangeDays'),
      queryTimeoutMs: requireBundleInt(bundle, 'queryTimeoutMs'),
      rateLimit: {
        max: requireBundleInt(bundle, 'rateLimitMax'),
        windowMs: requireBundleInt(bundle, 'rateLimitWindowMs'),
      },
    },
  }
}
