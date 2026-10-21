# ADR 0031: Keep → Tower Entitlement Message Contract

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** tower, keep
- **Closes gaps identified after ADR 0030:** the keep→tower RabbitMQ contract was never made
  concrete, and org-level seat limits had no field to live in

## Context

ADR 0001/0018 established the *relationship* (keep publishes, tower materializes, one
direction, never reversed) but never specified the actual message contract. A first pass at
this proposed keep publish full entitlement-state snapshots, gated by a version number tower
would use to discard stale ones. That design was wrong: it forces keep into an unnatural
publishing shape (recompute-and-republish full state on every discrete change, implicitly
pushing toward batching/timers to avoid a flood of near-identical snapshots) to solve an
ordering problem that belongs on the consumer side and has cheaper, well-known solutions there.
Coupling a producer's publishing shape to a consumer's ordering concerns is exactly backwards.

## Decision

### Keep publishes discrete, meaningful events — the same pattern used everywhere else in this system

Routing: `entitlement.<eventType>` (`role-granted`, `role-revoked`, `trial-granted`,
`trial-extended`, `converted-to-paid`, `seat-limit-changed`, ...) — an open, extensible
vocabulary, not a fixed enum tower needs to fully enumerate; unrecognized types are logged and
ignored, not treated as an error. Each event is self-contained, carrying only what that
specific change needs:

```ts
// entitlement.role-granted
{ tenant: '', scope: { account: '' } | { tenant: '' }, sequence: 0, role: { name: '', scope: '' } }

// entitlement.seat-limit-changed
{ tenant: '', scope: { tenant: '' }, sequence: 0, seatLimit: 0 }
```

`tenant` (ADR 0020) gains a `seatLimit` field to receive the latter — this is also where org-level
seat-limit capacity checks (from the invite-quota discussion) get their concrete home.

### Ordering defenses live on the consumer, layered from cheapest to most involved

1. **Idempotent, defensive command handlers.** Grant/revoke are set-membership operations
   (ensure present / ensure absent), naturally harmless under minor reordering or redelivery —
   no special-casing required for the common case.
2. **Consequent's own per-actor command queue.** Commands against the same actor are already
   processed sequentially once they reach tower — inherent to the actor model, not something
   either side needs to build.
3. **Invariant-rejecting command handlers.** Consequent models can reject a command that
   doesn't make sense against current state — a real backstop independent of delivery order.
4. **`sequence`, available but not mandatory.** A monotonic counter per `(tenant, scope)` that
   tower *can* use to detect a gap and briefly buffer-and-wait, or discard something clearly
   stale — a tool to reach for if genuine reordering turns out to be an operational problem in
   practice, not upfront machinery built defensively for an unlikely scenario.

This keeps keep free to publish exactly what happened, when it happened — no batching, no
timers, no coupling to how tower chooses to consume it.

## Consequences

- Tower needs a RabbitMQ consumer for the `entitlement.*` routing space, translating each event
  into the corresponding consequent command against the target `account` or `tenant` actor.
- `tenant` (ADR 0020) gains `seatLimit`.
- Command handlers for role grant/revoke should be written as set-membership operations
  specifically because that shape is what makes them tolerant of minor reordering — worth
  keeping in mind as an implementation constraint, not just a suggestion.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0022](0022-herald-communications-service.md) (the discrete-event pattern this follows)
