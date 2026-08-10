import { getBase62Provider } from 'node-flakes'

// A single k-sortable id generator for actor ids this codebase needs
// freshly generated rather than caller-supplied or tenant-scoped-key-
// derived: `accountId`, and `identityId` (see `identity_actor.ts`'s header
// comment -- `identityHash` is a searchable field, not the actor's id,
// specifically to avoid overflowing `consequent-postgres`'s fixed
// `character(42)` id-map column). Wrapped in its own small interface so
// tests can inject a deterministic fake instead of a real flake generator
// (real flakes embed a timestamp + node identifier and are not
// reproducible across runs).
export interface IdGenerator {
  nextAccountId(): string
  nextIdentityId(): string
}

export function createIdGenerator(nodeIdentifier = 'tower'): IdGenerator {
  const provider = getBase62Provider(nodeIdentifier)
  return {
    nextAccountId: () => provider(),
    nextIdentityId: () => provider(),
  }
}
