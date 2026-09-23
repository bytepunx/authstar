// Per design/stories/herald/001-actor-definitions.md and
// design/stories/herald/003-communication-types-and-templates.md.
//
// Each version is a *distinct* actor instance -- `identifiedBy: 'templateId'`
// is a node-flakes id the route generates before calling `consequent.handle`
// (same pattern tower's `invite.token` uses), not a field consequent derives
// on its own. "Editing" a template never mutates an existing instance; it
// creates a brand new one with `version` computed by the route as
// `(current max for this tenant/communicationType) + 1`. No update, no
// delete, ever (Story 001).

export interface TemplateState {
  templateId: string
  communicationType: string
  tenant: string | null
  version: number
  subjectTemplate: string
  bodyTemplate: string
  createdAt: string
}

interface CreateCommand {
  templateId: string
  communicationType: string
  tenant: string | null
  version: number
  subjectTemplate: string
  bodyTemplate: string
}

function exists(state: TemplateState): boolean {
  return Boolean(state.createdAt)
}

// A command `then` handler's first parameter is the full `ActorInstance`
// wrapper, not bare state -- see the note in `communication_type_actor.ts`
// for the full explanation (confirmed directly against consequent's
// source, not tower's pilot convention, which never actually exercised
// this).
interface Instance { state: TemplateState }

function create(instance: Instance, command: CreateCommand) {
  // Every `template.create` targets a freshly generated `templateId`, so
  // there's no legitimate "already exists" case -- this guard only catches
  // a caller-side id-generation bug (a flake collision), not a real
  // business rule.
  if (exists(instance.state)) {
    return Promise.reject(new Error('template already exists for this id'))
  }
  return {
    type: 'template.created',
    templateId: command.templateId,
    communicationType: command.communicationType,
    tenant: command.tenant,
    version: command.version,
    subjectTemplate: command.subjectTemplate,
    bodyTemplate: command.bodyTemplate,
  }
}

function created(state: TemplateState, event: CreateCommand & { type: string }) {
  state.templateId = event.templateId
  state.communicationType = event.communicationType
  state.tenant = event.tenant
  state.version = event.version
  state.subjectTemplate = event.subjectTemplate
  state.bodyTemplate = event.bodyTemplate
  state.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

export default function templateActor() {
  return {
    actor: {
      namespace: 'herald',
      type: 'template',
      identifiedBy: 'templateId',
      searchableBy: ['tenant', 'communicationType'],
    },
    state: {
      templateId: '',
      communicationType: '',
      tenant: null,
      version: 1,
      subjectTemplate: '',
      bodyTemplate: '',
      createdAt: '',
    },
    commands: {
      create,
    },
    events: {
      created,
    },
  }
}
