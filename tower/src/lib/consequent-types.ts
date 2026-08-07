import initialize from 'consequent'

// `consequent`'s package entry point only exports `initialize` as a default
// export -- its `ConsequentApi` interface lives in `types.ts` but isn't
// re-exported from the package's own entry point (confirmed by reading the
// source directly, not assumed). Deriving the type from `initialize`'s own
// return signature works regardless of whether that changes later.
export type ConsequentApi = Awaited<ReturnType<typeof initialize>>
