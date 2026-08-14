import { describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { seedBuiltInTemplates, BUILT_IN_TEMPLATES } from '../../src/lib/seed-templates.js'
import { resolveCurrentTemplate } from '../../src/lib/template-lookup.js'
import { render, validateTemplateSyntax } from '../../src/lib/mustache-render.js'

// Story 003's "Not Covered Here: seeding the built-in global-default
// templates herald ships with -- an operational/deployment concern, not
// an API route." This is that seeding (server.ts calls it once at boot),
// tested directly against an in-memory consequent rather than through any
// HTTP route, since none exists for creating a `tenant: null` template
// (deliberately -- see Story 003's own text).

describe('seedBuiltInTemplates', () => {
  it('creates the invite-sent global-default template at version 1', async () => {
    const consequent = await buildInMemoryConsequent()
    await seedBuiltInTemplates(consequent, () => {})

    const instance = await consequent.fetch('template', 'seed-invite-sent-v1')
    const state = instance!.state as { communicationType: string, tenant: string | null, version: number, createdAt: string }
    expect(state.createdAt).toBeTruthy()
    expect(state.communicationType).toBe('invite-sent')
    expect(state.tenant).toBeNull()
    expect(state.version).toBe(1)
  })

  it('is idempotent across repeated calls -- never creates a second version on a redeploy/restart', async () => {
    const consequent = await buildInMemoryConsequent()
    await seedBuiltInTemplates(consequent, () => {})
    await seedBuiltInTemplates(consequent, () => {})
    await seedBuiltInTemplates(consequent, () => {})

    const resolved = await resolveCurrentTemplate(consequent, 'some-tenant-with-no-override', 'invite-sent')
    expect(resolved!.version).toBe(1)
  })

  it('resolves as the global-default fallback for a tenant with no override of its own (Story 003\'s two-tier lookup)', async () => {
    const consequent = await buildInMemoryConsequent()
    await seedBuiltInTemplates(consequent, () => {})

    const resolved = await resolveCurrentTemplate(consequent, 'acme', 'invite-sent')
    expect(resolved).not.toBeNull()
    expect(resolved!.tenant).toBeNull()
  })

  it('every built-in template is syntactically valid mustache', () => {
    for (const builtIn of BUILT_IN_TEMPLATES) {
      expect(() => validateTemplateSyntax(builtIn.subjectTemplate)).not.toThrow()
      expect(() => validateTemplateSyntax(builtIn.bodyTemplate)).not.toThrow()
    }
  })

  it('invite-sent renders correctly against exactly the templateData shape tower\'s real provisioning flow sends', async () => {
    const consequent = await buildInMemoryConsequent()
    await seedBuiltInTemplates(consequent, () => {})
    const template = await resolveCurrentTemplate(consequent, 'acme', 'invite-sent')

    // Matches tower/src/routes/provisioning.ts's real encryptForHerald
    // call exactly -- { tenant: { name }, token, adminHost }.
    const templateData = { tenant: { name: 'Acme' }, token: 'abc123token', adminHost: 'admin.acme.authstar.app' }

    const subject = render(template!.subjectTemplate, templateData)
    const body = render(template!.bodyTemplate, templateData)

    expect(subject).toBe("You're invited to Acme")
    expect(body).toContain('Acme')
    expect(body).toContain('https://admin.acme.authstar.app/oauth2/select?invite=abc123token')
  })
})
