// Per design/stories/tower/003-identity-resolution-at-login.md and ADR
// 0017/0027/0028. The hash itself
// (`HMAC-SHA256(identityHashKey, tenant + ':' + idp + ':' + idp_sub)`) is
// computed *only* by portcullis; tower never sees the raw `idp_sub` or
// computes the hash itself, only stores/looks up by it.
//
// `identifiedBy: 'id'` (a freshly generated id, `ids.nextIdentityId()`
// -- see `account_actor.ts`'s identical `accountId` pattern), NOT
// `identityHash` directly. `identityHash` is a `searchableBy` field instead.
// This actor's id used to *be* the raw hash, but `consequent-postgres`
// stores an actor's id in a fixed `character(42)` column
// (`<type>_id_map.aggregate_id`) -- a full 64-character hex SHA-256 digest
// overflows it, a real Postgres error only surfacing once this runs against
// a real database, never against the in-memory adapter tests actually
// exercise. Rather than truncate the hash (losing entropy in a
// security-relevant value used for account resolution), it's kept in full
// as an indexed, searchable field, with an unrelated generated id as the
// actual primary key -- the same "hash-derived value doesn't have to be the
// row's PK" fix, applied here instead of truncating like `contact`'s id and
// the invite token do (those two are fine truncated: they're never
// independently recomputed by another service, unlike `identityHash`, which
// portcullis computes and tower only ever looks up by).
//
// `identifiedBy: 'id'` (not `'identityId'`) because consequent-postgres's
// search adapter always reads `state.id` when updating the search index --
// `state[identifiedBy]` is set by the core dispatcher, but the adapter
// only looks at `.id`. Using `'id'` keeps the two in sync without patching
// the adapter. The field carries the same generated identityId value either
// way; no application code reads `state.id` by name.
//
// No `email` field -- PII lives only on `contact` (see
// `src/lib/contact-store.ts`), joined via `account.contactId`, per ADR
// 0023/0027's removal of email from this actor.
//
// A not-yet-created `identity` instance has a valid-shaped, all-default
// state with `accountId: ''` -- same "empty string means doesn't exist"
// convention `tenant_actor.ts` uses for `createdAt`, used by callers
// (`/enrich`, `/identities/resolve`) to distinguish "no such identity" from
// "identity resolves to this account".
export interface IdentityState {
  id: string
  identityHash: string
  tenant: string
  idp: string
  accountId: string
}

interface CreateCommand {
  identityHash: string
  tenant: string
  idp: string
  accountId: string
}

function create(_identity: IdentityState, command: CreateCommand) {
  return {
    type: 'identity.created',
    identityHash: command.identityHash,
    tenant: command.tenant,
    idp: command.idp,
    accountId: command.accountId,
  }
}

function created(identity: IdentityState, event: CreateCommand) {
  identity.identityHash = event.identityHash
  identity.tenant = event.tenant
  identity.idp = event.idp
  identity.accountId = event.accountId
}

export default function identityActor() {
  return {
    actor: {
      namespace: 'tower',
      type: 'identity',
      identifiedBy: 'id',
      searchableBy: ['identityHash', 'tenant', 'idp', 'accountId'],
    },
    state: {
      id: '',
      identityHash: '',
      tenant: '',
      idp: '',
      accountId: '',
    },
    commands: { create },
    events: { created },
  }
}
