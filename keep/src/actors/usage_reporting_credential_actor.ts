// Per design/stories/keep/001-actor-definitions.md ("usageReportingCredential")
// and design/stories/keep/005-usage-records-and-credentials.md.
//
// Deliberately narrow -- reports usage only. Secret returned once at
// creation; only a salted hash stored (the route layer's job, not this
// actor's -- the actor just persists whatever hash it's handed). Multiple
// concurrent credentials per application allowed by design -- rotation is
// create-new-then-delete-old, never a forced single-active-credential
// downtime window (ADR 0079).

export type UsageReportingCredentialStatus = 'active' | 'revoked'

export interface UsageReportingCredentialState {
  credentialId: string
  tenant: string
  application: string
  hashedSecret: string
  status: UsageReportingCredentialStatus
  createdAt: string
}

interface CreateCommand {
  credentialId: string
  tenant: string
  application: string
  hashedSecret: string
}

function create(_credential: UsageReportingCredentialState, command: CreateCommand) {
  return {
    type: 'usageReportingCredential.created',
    credentialId: command.credentialId,
    tenant: command.tenant,
    application: command.application,
    hashedSecret: command.hashedSecret,
  }
}

function isActive(credential: UsageReportingCredentialState) {
  return credential.status === 'active'
}

function revoke(_credential: UsageReportingCredentialState) {
  return { type: 'usageReportingCredential.revoked' }
}

function rejectRevoke() {
  return Promise.reject(new Error('credential is already revoked'))
}

function created(credential: UsageReportingCredentialState, event: CreateCommand) {
  credential.credentialId = event.credentialId
  credential.tenant = event.tenant
  credential.application = event.application
  credential.hashedSecret = event.hashedSecret
  credential.status = 'active'
  credential.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
}

function revoked(credential: UsageReportingCredentialState) {
  credential.status = 'revoked'
}

export default function usageReportingCredentialActor() {
  return {
    actor: {
      namespace: 'keep',
      type: 'usageReportingCredential',
      identifiedBy: 'credentialId',
      searchableBy: ['tenant', 'application', 'status'],
    },
    state: {
      credentialId: '',
      tenant: '',
      application: '',
      hashedSecret: '',
      status: 'active',
      createdAt: '',
    },
    commands: {
      create,
      revoke: [
        { when: isActive, then: revoke },
        rejectRevoke,
      ],
    },
    events: {
      created,
      revoked,
    },
  }
}
