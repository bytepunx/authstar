import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { nextId } from '../lib/flakes.js'
import { validateTemplateSyntax } from '../lib/mustache-render.js'
import { listTenantTemplates, nextTenantVersion } from '../lib/template-lookup.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/herald/003-communication-types-and-templates.md.
// No edit, no delete, ever -- creating always produces a new version; the
// highest version number is implicitly current, no separate "activate"
// step. Gated by `communication-types:manage` -- same grant as
// communication-types.ts, part of the same "types/templates CRUD" family
// (Story 006).

const typeParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'type'],
  properties: { tenantSlug: { type: 'string' }, type: { type: 'string' } },
} as const

const versionParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'type', 'version'],
  properties: { tenantSlug: { type: 'string' }, type: { type: 'string' }, version: { type: 'integer' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subjectTemplate', 'bodyTemplate'],
  properties: {
    subjectTemplate: { type: 'string' },
    bodyTemplate: { type: 'string' },
  },
} as const

const templateRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/communication-types/:type/templates', { schema: { params: typeParamsSchema, body: createBodySchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug, type } = request.params as { tenantSlug: string, type: string }
    const body = request.body as { subjectTemplate: string, bodyTemplate: string }

    // "Does it parse" validation only (Story 003) -- no deeper schema of
    // what `templateData` variables will actually arrive.
    try {
      validateTemplateSyntax(body.subjectTemplate)
      validateTemplateSyntax(body.bodyTemplate)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const version = await nextTenantVersion(app.consequent, tenantSlug, type)
    const templateId = nextId()

    const results = await app.consequent.handle(templateId, 'template.create', {
      templateId,
      communicationType: type,
      tenant: tenantSlug, // never null through this tenant-scoped route -- global defaults are system-seeded, not created here (Story 003)
      version,
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const instance = await app.consequent.fetch('template', templateId)
    return reply.code(201).send(instance!.state)
  })

  app.get('/tenants/:tenantSlug/communication-types/:type/templates', { schema: { params: typeParamsSchema }, preHandler: requirePermission('communication-types:manage') }, async (request) => {
    const { tenantSlug, type } = request.params as { tenantSlug: string, type: string }
    return listTenantTemplates(app.consequent, tenantSlug, type)
  })

  app.get('/tenants/:tenantSlug/communication-types/:type/templates/:version', { schema: { params: versionParamsSchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug, type, version } = request.params as { tenantSlug: string, type: string, version: number }
    const versions = await listTenantTemplates(app.consequent, tenantSlug, type)
    const found = versions.find((v) => v.version === Number(version))
    if (!found) {
      return reply.code(404).send()
    }
    return found
  })
}

export default templateRoutes
