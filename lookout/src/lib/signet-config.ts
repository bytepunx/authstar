// Pure decision logic for lookout's signet wiring (Story 002, ADR 0102).
// Kept separate from server.ts (the thin, untested entrypoint -- same
// keep/herald convention: server.ts wires real I/O, this module holds the
// unit-testable rules) so the Env-Only vs. Signet-Configured precedence and
// the fail-loud-on-missing-field behavior both have direct test coverage.

// Env-Only Mode's existing, unchanged default -- preserved exactly as
// `server.ts` read it before this story (today's behavior when
// `SIGNET_ADDR` is absent).
export const DEFAULT_RABBITMQ_URL = 'amqp://localhost'

// ADR 0102: a service is in Signet-Configured Mode the moment its bootstrap
// env vars are present. Lookout's only bootstrap coordinate that gates the
// mode switch is `SIGNET_ADDR` -- presence alone decides the branch,
// independent of whatever the other signet env vars end up being.
export function isSignetConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SIGNET_ADDR)
}

// Env-Only Mode: every setting comes from plain env vars, unchanged from
// lookout's pre-signet behavior.
export function resolveEnvOnlyRabbitmqUrl(env: NodeJS.ProcessEnv): string {
  return env.LOOKOUT_RABBITMQ_URL ?? DEFAULT_RABBITMQ_URL
}

export function decodeBundleSecrets(bundle: Record<string, unknown> | undefined): Record<string, string> {
  const secrets = (bundle?.secrets as Record<string, string> | undefined) ?? {}
  const decoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    decoded[key] = Buffer.from(value, 'base64').toString('utf8')
  }
  return decoded
}

// Signet-Configured Mode: signet is authoritative -- `bundle.rabbitmqUrl`
// (or its decoded `secrets.rabbitmqUrl` counterpart) is the only source.
// No hardcoded default, no env fallback in this mode (ADR 0102's
// missing-field-behavior section) -- a missing field fails startup loudly,
// naming the field and where to provision it, rather than silently
// substituting a literal or falling back to `LOOKOUT_RABBITMQ_URL`.
export function resolveSignetRabbitmqUrl(bundle: Record<string, unknown>, secrets: Record<string, string>): string {
  const rabbitmqUrl = (bundle.rabbitmqUrl as string | undefined) ?? secrets.rabbitmqUrl
  if (!rabbitmqUrl) {
    throw new Error('signet bundle missing rabbitmqUrl -- provision it in the lookout secret scope (secrets/authstar/lookout/) per ADR 0102 / Story 002')
  }
  return rabbitmqUrl
}
