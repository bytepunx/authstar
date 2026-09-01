// ADR 0102's fail-loud rule for keep's Signet-Configured Mode (which is the
// only mode keep runs in -- its bootstrap vars are already required
// unconditionally, no Env-Only Mode exists here): a secret missing from the
// fetched signet bundle is an operator provisioning gap, surfaced as a
// startup failure naming the field, never silently substituted with an env
// var or a hardcoded default.
//
// Shared by `src/server.ts` and `src/sync-pricing.ts` (which otherwise
// deliberately duplicate their own `decodeBundleSecrets`/`requireEnv`, per
// each file's own top comment on why they're self-contained entrypoints) --
// this one piece of validation logic is pure and its exact error-message
// contract worth testing directly, which a shared, side-effect-free module
// makes possible without importing either entrypoint's own module-level
// `main().catch(...)` (which would immediately try to dial signet on
// import).
export function requireBundleSecret(
  bundle: Record<string, unknown>,
  secrets: Record<string, string>,
  field: string,
): string {
  const value = (bundle[field] as string | undefined) ?? secrets[field]
  if (!value) {
    throw new Error(`signet bundle is missing required secret '${field}' -- provision it in signet for this service`)
  }
  return value
}
