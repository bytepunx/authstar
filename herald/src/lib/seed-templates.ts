import type { ConsequentApi } from './consequent-types.js'

// Global-default (`tenant: null`) templates herald ships with -- Story
// 003's own "Not Covered Here" note: "Seeding the built-in global-default
// templates herald ships with -- an operational/deployment concern, not
// an API route." A tenant-scoped `POST .../templates` call is explicitly
// the *wrong* mechanism for this (that story: "tenant on the resulting
// template is this tenant's slug -- not null... never created through
// this tenant-scoped route"). This module is that seeding, run once at
// `server.ts` boot instead.
//
// Deterministic `templateId` per built-in, not `nextId()`'s random flake
// -- idempotent across restarts: if this exact id's actor instance
// already exists, it's skipped rather than creating a duplicate (and
// bumping the global-default lineage's version) on every boot.

export interface BuiltInTemplate {
  templateId: string
  communicationType: string
  subjectTemplate: string
  bodyTemplate: string
}

// `invite-sent`'s `templateData` shape here matches exactly what tower's
// `POST /tenants` provisioning flow encrypts (`tower/src/routes/
// provisioning.ts`): `{ tenant: { name }, token, adminHost }`, nesting
// `tenant.name` per ADR 0078's own templateData convention rather than a
// flat `tenantName` -- confirmed directly against that route, not
// guessed. The invite-acceptance URL below is this module's own
// best-effort default (no story in this design repo pins the exact
// redemption URL shape yet) -- a tenant can always override it with its
// own `tenant`-scoped template version, the same two-tier mechanism every
// other communication type already gets.
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    templateId: 'seed-invite-sent-v1',
    communicationType: 'invite-sent',
    subjectTemplate: "You're invited to {{tenant.name}}",
    bodyTemplate:
      'Hi,\n\n' +
      "You've been invited to administer {{tenant.name}} on authstar.\n\n" +
      'Accept your invite: https://{{adminHost}}/oauth2/select?invite={{token}}\n\n' +
      "If you weren't expecting this invitation, you can safely ignore this email.",
  },
]

export async function seedBuiltInTemplates(consequent: ConsequentApi, log: (msg: string) => void): Promise<void> {
  for (const builtIn of BUILT_IN_TEMPLATES) {
    const instance = await consequent.fetch('template', builtIn.templateId)
    const state = instance?.state as { createdAt?: string } | undefined
    if (state?.createdAt) continue // already seeded in an earlier boot -- idempotent, not re-created

    await consequent.handle(builtIn.templateId, 'template.create', {
      templateId: builtIn.templateId,
      communicationType: builtIn.communicationType,
      tenant: null,
      version: 1,
      subjectTemplate: builtIn.subjectTemplate,
      bodyTemplate: builtIn.bodyTemplate,
    })
    log(`herald: seeded built-in global-default template for communicationType="${builtIn.communicationType}"`)
  }
}
