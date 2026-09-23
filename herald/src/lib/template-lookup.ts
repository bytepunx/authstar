import type { ConsequentApi } from './consequent-types.js'
import type { TemplateState } from '../actors/template_actor.js'

// The default in-memory search adapter only indexes truthy field values
// (confirmed directly against consequent's own `default/searchAdapter.js`
// -- `addToFieldIndex` is guarded by `if (value)`), so a global-default
// template (`tenant: null`) can never be found via `find('template', {
// tenant: null, ... })`. Searching by `communicationType` alone (always a
// non-empty string) and filtering the tenant dimension in memory works
// around that for both the in-memory and Postgres-backed adapters alike --
// this file is the one place that fallback logic lives, per Story 003's
// "this fallback logic lives in the send worker's own lookup" note.
async function templatesFor(consequent: ConsequentApi, communicationType: string): Promise<TemplateState[]> {
  // `consequent.find`'s own type signature (`criteria: Record<string,
  // unknown>`) is misleading -- `consequent-postgres`'s real search
  // adapter, the one production uses, requires criteria wrapped in an
  // array of OR'd sets (`criteria.forEach(set => ...)`, confirmed against
  // its source: `consequent-postgres/dist/search.js`) and throws
  // (`criteria.forEach is not a function`) if given a flat object instead
  // -- caught by this pilot's own integration tier against real Postgres,
  // not visible against the default in-memory adapter, which happily
  // accepts a flat object. Every `find` call in this codebase wraps its
  // criteria in a single-element array for that reason, even though the
  // published type doesn't require it.
  const instances = await consequent.find('template', [{ communicationType }] as unknown as Record<string, unknown>)
  return instances.map((i) => i.state as unknown as TemplateState)
}

function highest(states: TemplateState[]): TemplateState | null {
  return states.reduce<TemplateState | null>((max, s) => (!max || s.version > max.version ? s : max), null)
}

// Highest version for this tenant's own override; if the tenant has never
// created one, falls back to the highest global-default version (Story
// 003's two-tier resolution, used when a publisher queues a new
// communication and herald needs to decide what to pin).
export async function resolveCurrentTemplate(consequent: ConsequentApi, tenant: string, communicationType: string): Promise<TemplateState | null> {
  const all = await templatesFor(consequent, communicationType)
  const tenantOwn = all.filter((s) => s.tenant === tenant)
  if (tenantOwn.length > 0) return highest(tenantOwn)
  const global = all.filter((s) => s.tenant === null)
  return highest(global)
}

// Resolves a *specific* pinned version (Story 002: "the template version
// matching (tenant, communicationType, templateVersion)... pinned at
// creation time"). The `communication` record only carries a bare version
// number, not which lineage (tenant-override vs. global-default) it came
// from, so this applies the same tenant-first-then-global preference used
// by `resolveCurrentTemplate` to relocate it -- a documented interpretation
// where the story doesn't spell out a discriminator field.
export async function resolvePinnedTemplate(consequent: ConsequentApi, tenant: string, communicationType: string, version: number): Promise<TemplateState | null> {
  const all = await templatesFor(consequent, communicationType)
  const tenantMatch = all.find((s) => s.tenant === tenant && s.version === version)
  if (tenantMatch) return tenantMatch
  return all.find((s) => s.tenant === null && s.version === version) ?? null
}

// Next version number for a tenant's own override lineage -- independent
// of the global-default lineage's own version numbering (Story 001: "no
// `application` dimension," two genuinely separate lineages sharing only a
// naming convention).
export async function nextTenantVersion(consequent: ConsequentApi, tenant: string, communicationType: string): Promise<number> {
  const all = await templatesFor(consequent, communicationType)
  const tenantOwn = all.filter((s) => s.tenant === tenant)
  const top = highest(tenantOwn)
  return top ? top.version + 1 : 1
}

export async function listTenantTemplates(consequent: ConsequentApi, tenant: string, communicationType: string): Promise<TemplateState[]> {
  const all = await templatesFor(consequent, communicationType)
  return all.filter((s) => s.tenant === tenant).sort((a, b) => b.version - a.version)
}
