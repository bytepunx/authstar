import type { ConsequentApi } from './consequent-types.js'
import type { CommunicationState } from '../actors/communication_actor.js'
import type { SendingConfigState } from '../actors/sending_config_actor.js'
import { decryptPayload, deserializeEnvelope, type PayloadKeyring } from './payload-crypto.js'
import { render } from './mustache-render.js'
import { resolvePinnedTemplate } from './template-lookup.js'
import { issueToken, type UnsubscribeKeyring } from './unsubscribe-token.js'

// Per design/stories/herald/002-send-worker-and-retry.md.

export interface SendMessage {
  to: string
  subject: string
  body: string
  headers: Record<string, string>
}

export interface SendResult {
  success: boolean
  providerMessageId?: string
  error?: { message: string, transient: boolean }
}

// One interface, SMTP or API-based implementations behind it (Story 002,
// ADR 0032) -- production wires a real adapter per `sendingConfig.provider`;
// tests supply a fake implementing this same shape, no real network/broker
// needed to exercise the worker's own logic.
export interface SendAdapter {
  send(message: SendMessage): Promise<SendResult>
}

export interface SendWorkerDeps {
  consequent: ConsequentApi
  payloadKeyring: PayloadKeyring
  unsubscribeKeyring: UnsubscribeKeyring
  adapterFor: (provider: string) => SendAdapter
  unsubscribeBaseUrl?: string
  now?: () => Date
  maxRetries?: number
  retryBackoffMs?: (retryCount: number) => number
}

const DEFAULT_MAX_RETRIES = 5
const defaultBackoff = (retryCount: number): number => Math.min(60_000 * 2 ** retryCount, 30 * 60_000)

export type ProcessOutcome = 'suppressed' | 'sent' | 'retry-scheduled' | 'failed' | 'skipped'

interface DecryptedPayload {
  to: string
  templateData: Record<string, unknown>
}

// Suppression and opt-out are checked before *every* send attempt,
// including retries (Story 002) -- always re-read fresh, never cached from
// a prior pass, so a suppression added between the first attempt and a
// scheduled retry still blocks that retry.
async function isBlocked(consequent: ConsequentApi, state: CommunicationState): Promise<boolean> {
  const suppressionInstance = await consequent.fetch('suppression', state.contactId)
  const suppressionState = suppressionInstance?.state as { createdAt?: string } | undefined
  if (suppressionState?.createdAt) return true

  if (state.category === 'marketing') {
    const optOutInstance = await consequent.fetch('optOut', state.contactId)
    const optOutState = optOutInstance?.state as { optedOutCategories?: string[] } | undefined
    // Opt-out categories are scoped to the communication's own `type`
    // (the conventional per-tenant name, e.g. "newsletter") -- the
    // coarser `category` field only has two values (transactional/
    // marketing) and gates whether opt-out applies at all, not which
    // specific opt-out entry to check (Story 001/002, a documented
    // interpretation where the story doesn't spell out the granularity).
    if (optOutState?.optedOutCategories?.includes(state.type)) return true
  }
  return false
}

export async function processCommunication(deps: SendWorkerDeps, tenant: string, idempotencyKey: string): Promise<ProcessOutcome> {
  const now = deps.now ?? (() => new Date())
  const key = `${tenant}:${idempotencyKey}`
  const instance = await deps.consequent.fetch('communication', key)
  const state = instance?.state as unknown as CommunicationState | undefined
  if (!state?.createdAt) {
    return 'skipped' // never created -- nothing to do
  }
  if (state.status !== 'pending') {
    return 'skipped' // already terminal, or a duplicate sweep/manual-retry pickup racing another caller
  }

  if (await isBlocked(deps.consequent, state)) {
    await deps.consequent.handle(key, 'communication.suppress', {})
    return 'suppressed'
  }

  // Rendering: the template version pinned at creation time, never the
  // current one (Story 002) -- an edit after this communication was queued
  // doesn't change what actually gets rendered.
  const template = await resolvePinnedTemplate(deps.consequent, tenant, state.type, state.templateVersion)
  if (!template) {
    await deps.consequent.handle(key, 'communication.markFailed', { error: `no template found for ${state.type} v${state.templateVersion}` })
    return 'failed'
  }

  const keyGeneration = deps.payloadKeyring.get(state.payloadKeyVersion)
  if (!keyGeneration) {
    await deps.consequent.handle(key, 'communication.markFailed', { error: `no payload key generation ${state.payloadKeyVersion}` })
    return 'failed'
  }

  let decrypted: DecryptedPayload
  try {
    const envelope = deserializeEnvelope(state.encryptedPayload)
    decrypted = decryptPayload(keyGeneration.privateKey, envelope) as DecryptedPayload
  } catch (err) {
    await deps.consequent.handle(key, 'communication.markFailed', { error: `payload decryption failed: ${(err as Error).message}` })
    return 'failed'
  }

  let subject = render(template.subjectTemplate, decrypted.templateData)
  let body = render(template.bodyTemplate, decrypted.templateData)
  const headers: Record<string, string> = {}

  const sendingConfigInstance = await deps.consequent.fetch('sendingConfig', tenant)
  const sendingConfig = sendingConfigInstance?.state as unknown as SendingConfigState | undefined

  // CAN-SPAM footer + List-Unsubscribe headers -- gated by `category`,
  // never auto-detected from content, never applied to transactional
  // (Story 002/ADR 0032).
  if (state.category === 'marketing') {
    const physicalAddress = sendingConfig?.physicalAddress ?? ''
    const token = issueToken(deps.unsubscribeKeyring, tenant, state.contactId, state.type)
    const base = deps.unsubscribeBaseUrl ?? 'https://unsubscribe.invalid/unsubscribe'
    const unsubUrl = `${base}?token=${token}`
    body = `${body}\n\n--\n${physicalAddress}\nUnsubscribe: ${unsubUrl}`
    headers['List-Unsubscribe'] = `<${unsubUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const provider = sendingConfig?.provider ?? 'smtp'
  const adapter = deps.adapterFor(provider)
  const result = await adapter.send({ to: decrypted.to, subject, body, headers })

  if (result.success) {
    await deps.consequent.handle(key, 'communication.markSent', { providerMessageId: result.providerMessageId ?? '' })
    return 'sent'
  }

  const errorMessage = result.error?.message ?? 'unknown send error'
  const transient = result.error?.transient ?? false
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoff = deps.retryBackoffMs ?? defaultBackoff

  // Transient + retries remaining -> scheduled for the sweep. Otherwise
  // (permanent failure, or transient but exhausted) -> terminal `failed`,
  // same value either way, no separate "gave up" state (Story 002).
  if (transient && state.retryCount < maxRetries) {
    const nextRetryAt = new Date(now().getTime() + backoff(state.retryCount)).toISOString()
    await deps.consequent.handle(key, 'communication.recordRetry', { nextRetryAt, lastError: errorMessage })
    return 'retry-scheduled'
  }

  await deps.consequent.handle(key, 'communication.markFailed', { error: errorMessage })
  return 'failed'
}

// Scheduled retry sweep (Story 002) -- not a special code path, the same
// handling triggered by a different caller. Picks up `pending` records
// whose `nextRetryAt` has arrived, or that have never been attempted at all
// (`nextRetryAt: null` -- the sweep also serves as the fallback path for a
// first attempt that never got an immediate try, e.g. after a process
// restart mid-ingestion).
export async function runRetrySweep(deps: SendWorkerDeps): Promise<ProcessOutcome[]> {
  const now = deps.now ?? (() => new Date())
  // Criteria wrapped in an array -- see the fuller note in
  // `template-lookup.ts#templatesFor` for why (`consequent-postgres`'s
  // real search adapter requires it despite the published type).
  const instances = await deps.consequent.find('communication', [{ status: 'pending' }] as unknown as Record<string, unknown>)
  const due = instances
    .map((i) => i.state as unknown as CommunicationState)
    .filter((s) => !s.nextRetryAt || new Date(s.nextRetryAt) <= now())
  const outcomes: ProcessOutcome[] = []
  for (const s of due) {
    outcomes.push(await processCommunication(deps, s.tenant, s.idempotencyKey))
  }
  return outcomes
}
