// Story 010/013: `X-Operator-Actor` becomes a real, permanent part of the
// event record via this one field, spread onto a command handler's
// returned event only when present. A tenant-scoped call for the exact
// same command never carries `command.actingAs` at all (the header is
// operator-route-only, per `operator-auth.ts`'s `operatorActor`), so this
// is a no-op there -- same event shape as before this story, not a
// conditional two different codepaths would need to reason about.
export function actingAsFields(command: { actingAs?: string }): { actingAs?: string } {
  return command.actingAs ? { actingAs: command.actingAs } : {}
}
