import type { ConsequentApi } from './consequent-types.js'

// Per ADR 0038 (keep's Stripe-driven producer side) / ADR 0031 (the
// concrete `entitlement.<eventType>` contract). Mirrors herald's own
// `comms-consumer.ts` `ChannelLike` convention exactly: a minimal
// structural interface, not `amqplib`'s own `Channel` type, so behavior/e2e
// tests can drive real consume/ack/nack sequencing against a fake channel
// with no broker running. The real `amqplib` wiring (connect, exchange/queue
// assert+bind to `entitlement.#`) lives in `src/server.ts` only.
//
// Unlike herald's comms consumer, this one needs the message's routing key
// (`entitlement.<eventType>`) to know which event type arrived -- the
// envelope itself carries no `type`/`eventType` field of its own per ADR
// 0031's examples.
export interface ConsumedMessage {
  content: Buffer
  fields: { routingKey: string }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

export interface EntitlementConsumerDeps {
  consequent: ConsequentApi
}

interface RoleRef {
  name: string
  scope: 'tenant' | { application: string }
}

interface EntitlementEnvelope {
  tenant: string
  scope: { account: string } | { tenant: string } | { organization: string }
  sequence?: number
  role?: RoleRef
  roles?: RoleRef[]
  grantedRoles?: RoleRef[]
  trialExpiresAt?: string
  seatLimit?: number | null
  apiKeyLimit?: number | null
  apiKeyRateLimit?: { requestsPerMinute: number, burst?: number } | null
}

function accountIdFrom(scope: EntitlementEnvelope['scope']): string | undefined {
  return 'account' in scope ? scope.account : undefined
}

function tenantIdFrom(scope: EntitlementEnvelope['scope']): string | undefined {
  return 'tenant' in scope ? scope.tenant : undefined
}

// ADR 0100: {organization} publishes straight to the organization itself
// (`organization.grantedRoles`/`.seatLimit`) -- never merged onto any
// individual member's own `account.roles`, which is what keeps org-
// purchased entitlement distinguishable from a member's personal usage.
function organizationIdFrom(scope: EntitlementEnvelope['scope']): string | undefined {
  return 'organization' in scope ? scope.organization : undefined
}

// keep's webhooks.ts publishes a role as `{ name: role.role, scope:
// role.application }` -- `scope` here is the plain application-slug
// string, not the `'tenant' | {application}` shape this file's own
// `RoleRef` models for the *account*-scoped path (account.grant-role's
// `RoleGrant` stores whatever it's given without runtime validation).
// `organization.grant-role`'s `GrantedRole` wants `{application, role}`
// fields specifically, so this translates rather than passing the
// `{name, scope}` shape straight through.
function grantedRoleFrom(role: RoleRef): { application: string, role: string } {
  return { application: typeof role.scope === 'string' ? role.scope : role.scope.application, role: role.name }
}

// Idempotent, defensive, set-membership translation from keep's open
// `entitlement.*` vocabulary into commands against the target `account`/
// `tenant` actor -- ADR 0038's own layered ordering defense (idempotent
// handlers first, consequent's per-actor command queue second, invariant
// checks third, the `sequence` field available-but-not-mandatory fourth).
// This pilot slice relies on the first two layers only (sufficient given
// `account.ts`'s grant/revoke event handlers are already idempotent
// set-membership operations) -- `sequence`-based gap detection is
// deliberately not implemented; see TESTING.md.
//
// Unrecognized event types are logged and ignored, not an error -- ADR
// 0031's vocabulary is explicitly open/extensible.
export async function handleEntitlementEvent(
  consequent: ConsequentApi,
  eventType: string,
  payload: EntitlementEnvelope,
): Promise<void> {
  switch (eventType) {
    case 'role-granted': {
      if (!payload.role) return
      const organizationId = organizationIdFrom(payload.scope)
      if (organizationId) {
        await consequent.handle(organizationId, 'organization.grant-role', { role: grantedRoleFrom(payload.role) })
        return
      }
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      await consequent.handle(accountId, 'account.grant-role', { role: payload.role })
      return
    }
    case 'role-revoked': {
      if (!payload.role) return
      const organizationId = organizationIdFrom(payload.scope)
      if (organizationId) {
        await consequent.handle(organizationId, 'organization.revoke-role', { role: grantedRoleFrom(payload.role) })
        return
      }
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      await consequent.handle(accountId, 'account.revoke-role', { role: payload.role })
      return
    }
    case 'trial-granted':
    case 'trial-extended': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId || !payload.role || !payload.trialExpiresAt) return
      await consequent.handle(accountId, 'account.grant-trial-role', {
        role: payload.role,
        trialExpiresAt: payload.trialExpiresAt,
      })
      return
    }
    case 'converted-to-paid': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      const roles = payload.grantedRoles ?? payload.roles ?? (payload.role ? [payload.role] : [])
      await Promise.all(roles.map((role) => consequent.handle(accountId, 'account.grant-role', { role })))
      return
    }
    case 'seat-limit-changed': {
      const organizationId = organizationIdFrom(payload.scope)
      if (organizationId) {
        await consequent.handle(organizationId, 'organization.set-seat-limit', { seatLimit: payload.seatLimit ?? null })
        return
      }
      const tenant = tenantIdFrom(payload.scope) ?? payload.tenant
      if (!tenant) return
      await consequent.handle(tenant, 'tenant.set-seat-limit', { seatLimit: payload.seatLimit ?? null })
      return
    }
    // design/adrs/0101-api-keys.md: unlike `seat-limit-changed` above,
    // `EntitlementScope` here can be `{account}` as well as `{organization}`
    // -- an individual account's own key limit is meaningful, keep's
    // `entitlement-publisher.ts` deliberately doesn't restrict these two
    // event types to `{tenant}|{organization}` the way `SeatLimitChangedEvent`
    // is restricted. No `{tenant}` fallback -- this feature is entirely
    // plan-mapping-scoped, never provisioning-time tenant-wide.
    case 'api-key-limit-changed': {
      // `payload.apiKeyLimit` is `number | null | undefined` -- `null`
      // (keep's own "unlimited") must survive as `null`, not collapse to
      // the fail-closed `0` default; only a genuinely *missing* field
      // (malformed/older-producer message) falls back to `0`. A plain `??`
      // would wrongly treat an explicit `null` the same as `undefined`.
      const apiKeyLimit = payload.apiKeyLimit === undefined ? 0 : payload.apiKeyLimit
      const organizationId = organizationIdFrom(payload.scope)
      if (organizationId) {
        await consequent.handle(organizationId, 'organization.set-api-key-limit', { apiKeyLimit })
        return
      }
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      await consequent.handle(accountId, 'account.set-api-key-limit', { apiKeyLimit })
      return
    }
    case 'api-key-rate-limit-changed': {
      const organizationId = organizationIdFrom(payload.scope)
      if (organizationId) {
        await consequent.handle(organizationId, 'organization.set-api-key-rate-limit', { apiKeyRateLimit: payload.apiKeyRateLimit ?? null })
        return
      }
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      await consequent.handle(accountId, 'account.set-api-key-rate-limit', { apiKeyRateLimit: payload.apiKeyRateLimit ?? null })
      return
    }
    default:
      // Open vocabulary (ADR 0031) -- an event type this pilot slice
      // doesn't yet translate is not an error.
      return
  }
}

export async function startEntitlementConsumer(
  channel: ChannelLike,
  queue: string,
  deps: EntitlementConsumerDeps,
): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: EntitlementEnvelope
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as EntitlementEnvelope
    } catch {
      channel.nack(msg, false, false) // malformed -- dead-letter, don't requeue forever
      return
    }

    const eventType = msg.fields.routingKey.replace(/^entitlement\./, '')
    handleEntitlementEvent(deps.consequent, eventType, payload)
      .then(() => channel.ack(msg))
      .catch(() => channel.nack(msg, false, true)) // transient failure -- requeue for redelivery
  })
}
