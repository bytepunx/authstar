// Per design/stories/tower/007-invites-and-invite-codes.md and ADR 0021/0067.
// `identifiedBy: 'token'` -- a single-use, non-guessable invite token.
//
// This pilot slice implements only *token*-based invites (the mechanism
// ADR 0067's tenant-creation first-admin invite and ADR 0021's elevated
// operator bootstrap both reuse) -- Story 007's *code*-based invites
// (`inviteCode`, multi-redemption trial codes with `maxRedemptions`) are
// deliberately deferred; see TESTING.md for the scope note. `redeem.type`
// in `POST /identities/resolve`'s request schema therefore only accepts
// `"invite"`, not `"inviteCode"`.
//
// `application: null` means tenant-wide (lands the invitee on `_admin` via
// normal login) -- the shape ADR 0067's first-admin invite always uses.
export interface InviteState {
  tenant: string
  application: string | null
  contactId: string
  roles: Array<{ name: string, scope: 'tenant' | { application: string } }>
  permissions: unknown[]
  status: 'pending' | 'accepted'
  createdAt: string
  expiresAt: string | null
}

interface CreateCommand {
  tenant: string
  application: string | null
  contactId: string
  roles: InviteState['roles']
  permissions: unknown[]
  expiresAt: string | null
}

interface AcceptCommand {
  accountId: string
}

function create(_invite: InviteState, command: CreateCommand) {
  return {
    type: 'invite.created',
    tenant: command.tenant,
    application: command.application,
    contactId: command.contactId,
    roles: command.roles ?? [],
    permissions: command.permissions ?? [],
    expiresAt: command.expiresAt,
  }
}

function isRedeemable(invite: InviteState) {
  if (invite.status !== 'pending') return false
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return false
  return true
}

function accept(_invite: InviteState, command: AcceptCommand) {
  return { type: 'invite.accepted', accountId: command.accountId }
}

function rejectAccept() {
  return Promise.reject(new Error('invite is not pending or has expired'))
}

function created(invite: InviteState, event: CreateCommand) {
  invite.tenant = event.tenant
  invite.application = event.application
  invite.contactId = event.contactId
  invite.roles = event.roles ?? []
  invite.permissions = event.permissions ?? []
  invite.status = 'pending'
  invite.createdAt = new Date(0).toISOString() // replaced by consequent's own event timestamp on read
  invite.expiresAt = event.expiresAt
}

function accepted(invite: InviteState) {
  invite.status = 'accepted'
}

export default function inviteActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'invite',
      identifiedBy: 'token',
      searchableBy: ['tenant', 'contactId', 'status'],
    },
    state: {
      tenant: '',
      application: null,
      contactId: '',
      roles: [],
      permissions: [],
      status: 'pending',
      createdAt: '',
      expiresAt: null,
    },
    commands: {
      create,
      accept: [
        { when: isRedeemable, then: accept },
        rejectAccept,
      ],
    },
    events: {
      created,
      accepted,
    },
  }
}
