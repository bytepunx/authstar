// Client-reportable event types this deployment allows through the
// client-facing ingestion path (design/stories/lookout/001-ingestion-contract.md:
// "an allowlisted set of client-reportable event types, not arbitrary
// free-form event names/data"). Lookout has no per-tenant config of its own
// (ADR 0035), so in a real deployment this would be signet-delivered
// config rather than a literal here -- hardcoded for now since no such
// config story exists yet; swapping the source doesn't change any
// validation logic in the route itself (buildApp accepts an override for
// exactly this reason).
export const CLIENT_EVENT_ALLOWLIST: ReadonlySet<string> = new Set([
  'client.page-view',
  'client.button-click',
  'client.form-submit',
  'client.error',
])

// Hard cap on the client-reported `payload` field, enforced by rejecting
// outright, never truncating (Story 001).
export const CLIENT_PAYLOAD_MAX_BYTES = 4096

export function isClientEventType(eventType: string): boolean {
  return eventType.startsWith('client.')
}
