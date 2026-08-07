// A genuinely fresh-per-call set of in-memory `consequent` adapters.
//
// Why this exists instead of just letting `initialize()` fall back to
// consequent's own built-in defaults (like tower's pilot does): consequent's
// default in-memory `actorStore`/`actorCache`/`eventStore`/`eventCache`/
// `searchAdapter` are each constructed *once*, at module-import time
// (`consequent/dist/index.js` calls `defaultActorStore()` etc. directly into
// a module-level `defaults` object, not inside `initialize()`) -- every
// `initialize()` call in the same process that doesn't pass its own adapters
// shares the *same* underlying backing state. "Fresh in-memory consequent
// per test" (`buildInMemoryConsequent()`, one call per `beforeEach`) is
// therefore an illusion: every test in a file quietly shares one event log,
// one search index, and one actor id-mapping table with every other test.
//
// That alone would just mean tests need unique tenant slugs to avoid
// collisions. What actually broke keep's own tests is worse: the default
// actor store's `create(type)` (`consequent/dist/default/actorStore.js`)
// unconditionally *resets* `state[type] = { actorIds: {}, systemIds: {} }`
// every time it's called -- and it gets called again on every fresh
// `initialize()`, the moment that instance first touches an actor type.
// Since `identifiedBy` domain ids are resolved to an internal, separately-
// generated `_id` through this exact table (`actors.js`'s `getSystemId`),
// wiping it orphans every actor of that type created by an *earlier*
// `initialize()` call -- its events are still sitting in the (separately
// singleton, non-resetting) event store, but the next `getSystemId` lookup
// for its domain id, finding no mapping, mints a *brand new* `_id` with no
// event history behind it. `find()` (which resolves matches by re-fetching
// each matched domain id) then silently returns that actor's bare default
// state -- blank fields, no error -- for anything created before the most
// recently constructed `initialize()` instance. Found by an actual test
// failure where a `find()` for a just-created plan mapping returned several
// *other* plan mappings with empty `grantedRoles` instead -- not something
// visible from reading consequent's source in isolation, only from three
// separate `initialize()` calls colliding in one process.
//
// Fix: don't touch consequent's defaults at all. Build one fresh, isolated
// `state` per `buildInMemoryConsequent()` call (spec/lib/in-memory-consequent.ts)
// and hand in explicit `actorStore`/`eventStore` (the two that matter for
// correctness) so every test genuinely starts from empty, with no reset-time
// bomb hiding in a shared module singleton.

interface Event {
  id?: string
  [key: string]: unknown
}

function createActorStore() {
  const state: Record<string, { actorIds: Record<string, string[]>, systemIds: Record<string, string[]>, snapshots: Record<string, unknown[]> }> = {}

  function ensure(type: string) {
    // Idempotent -- unlike consequent's own default, calling this more than
    // once for the same type (which happens constantly: every fresh
    // `initialize()` instance re-triggers its own per-instance adapter
    // cache) never wipes out what's already there.
    if (!state[type]) {
      state[type] = { actorIds: {}, systemIds: {}, snapshots: {} }
    }
    return state[type]
  }

  return {
    create: async (type: string) => {
      const t = ensure(type)
      return {
        fetch: async (id: unknown) => {
          const systemId = t.actorIds[id as string]?.slice(-1)[0]
          if (!systemId) return undefined
          return t.snapshots[systemId]?.slice(-1)[0]
        },
        getSystemId: async (id: unknown) => t.actorIds[id as string]?.slice(-1)[0],
        mapIds: async (systemId: string, actorId: unknown) => {
          const key = actorId as string
          t.actorIds[key] = [...(t.actorIds[key] ?? []), systemId]
          t.systemIds[systemId] = [...(t.systemIds[systemId] ?? []), key]
        },
        store: async (id: unknown, _vector: string, instance: Record<string, unknown>) => {
          const systemId = (instance._id as string) ?? (id as string)
          t.snapshots[systemId] = [...(t.snapshots[systemId] ?? []), instance]
        },
      }
    },
  }
}

function createActorCache() {
  // A cache that never actually caches anything is always *correct* --
  // consequent's own default falls straight through to the store on every
  // miss. Kept as a no-op here too; only the store's reset-on-create bug
  // needed fixing.
  return {
    create: async () => ({
      fetch: async () => undefined,
      getSystemId: async () => undefined,
      mapIds: async () => undefined,
      store: async () => undefined,
    }),
  }
}

function createEventStore() {
  const state: Record<string, Record<string, Event[]>> = {}

  function ensure(type: string) {
    if (!state[type]) state[type] = {}
    return state[type]
  }

  return {
    create: async (type: string) => {
      const t = ensure(type)
      return {
        getEventsFor: async (actorId: unknown) => t[actorId as string] ?? [],
        storeEvents: async (actorId: unknown, events: Event[]) => {
          const key = actorId as string
          t[key] = [...(t[key] ?? []), ...events]
        },
      }
    },
  }
}

function createEventCache() {
  return {
    create: async () => ({
      getEventsFor: async () => [],
      storeEvents: async () => undefined,
    }),
  }
}

// consequent's own default searchAdapter doesn't have the reset-on-create
// bug (its `create` lazily initializes a field index without ever
// destroying an existing one) -- but it's still the same kind of
// module-level singleton, so results still silently accumulate across every
// test in a process that doesn't supply its own. A `find()` matching on a
// field value reused across many tests (the same tenant slug, the same
// Stripe price id) would keep returning *every* test's matching records,
// not just the current test's own -- correct content after the actorStore
// fix above, but still cross-test pollution a `.find(...)[0]`-style lookup
// can't tell apart from "the" record this test created. Given a fresh
// instance per call anyway, simplest to make this one fresh too.
function createSearchAdapter() {
  const state: Record<string, Record<string, { values: unknown[], ids: Record<string, unknown[]> }>> = {}

  function fieldIndex(type: string, field: string) {
    if (!state[type]) state[type] = {}
    if (!state[type][field]) state[type][field] = { values: [], ids: {} }
    return state[type][field]
  }

  function getFieldValue(obj: Record<string, unknown>, field: string): unknown {
    return field.includes('.') ? field.split('.').reduce((o: unknown, f) => (o as Record<string, unknown> | undefined)?.[f], obj) : obj[field]
  }

  function addValue(index: { values: unknown[], ids: Record<string, unknown[]> }, id: unknown, value: unknown) {
    if (value === undefined || value === null || value === '') return
    const key = value as string
    if (!index.ids[key]) index.ids[key] = []
    index.ids[key].push(id)
    if (!index.values.includes(value)) index.values.push(value)
  }

  function removeValue(index: { values: unknown[], ids: Record<string, unknown[]> }, id: unknown, value: unknown) {
    if (value === undefined || value === null || value === '') return
    const key = value as string
    if (!index.ids[key]) return
    index.ids[key] = index.ids[key].filter((existing) => existing !== id)
  }

  // `criteria` is an array of AND-groups, OR'd together across the array --
  // matching `consequent-postgres`'s actual runtime contract (its `find()`
  // calls `criteria.forEach(set => ...)`, confirmed against
  // `consequent-postgres/dist/search.js`), not the plain flat-object shape
  // consequent's own *type* declares (`SearchAdapterInstance.find(criteria:
  // Record<string, unknown>)`) or its default in-memory adapter actually
  // implements. Every caller in this codebase goes through
  // `src/lib/consequent-types.ts`'s `searchCriteria()` helper to produce
  // this shape, so the in-memory (behavior/e2e) and Postgres (integration)
  // tiers exercise the exact same calling convention.
  function findIds(type: string, criteriaGroups: Array<Record<string, unknown>>): unknown[] {
    const resultIds = new Set<unknown>()
    for (const group of criteriaGroups) {
      let ids: unknown[] | undefined
      for (const field of Object.keys(group)) {
        const value = group[field]
        const index = fieldIndex(type, field)
        const matchedIds = (index.ids[value as string] ?? []) as unknown[]
        ids = ids === undefined ? matchedIds : ids.filter((id) => matchedIds.includes(id))
        if (ids.length === 0) break
      }
      for (const id of ids ?? []) resultIds.add(id)
    }
    return [...resultIds]
  }

  return {
    create: async (type: string) => ({
      find: (criteria: unknown): unknown[] => findIds(type, criteria as Array<Record<string, unknown>>),
      // Every `handle()` call re-runs `update` for *every* searchableBy
      // field, not just the ones that changed -- a naive "just add the
      // current value" implementation (this file's first draft) leaves a
      // duplicate id in an unchanged field's bucket every single time any
      // command mutates the actor at all (found by an actual test: retiring
      // a plan mapping made it show up twice in a same-tenant list, since
      // `tenant` never changed but got re-added on the retire command too).
      // consequent's own default search adapter avoids this by always
      // removing the *before* value's entry before adding the *after*
      // value's -- mirrored here.
      update: async (fieldList: string[], updated: Record<string, unknown>, original: Record<string, unknown>) => {
        for (const field of fieldList) {
          const index = fieldIndex(type, field)
          removeValue(index, updated.id, getFieldValue(original, field))
          addValue(index, updated.id, getFieldValue(updated, field))
        }
      },
    }),
  }
}

export interface MemoryAdapters {
  actorStore: ReturnType<typeof createActorStore>
  actorCache: ReturnType<typeof createActorCache>
  eventStore: ReturnType<typeof createEventStore>
  eventCache: ReturnType<typeof createEventCache>
  searchAdapter: ReturnType<typeof createSearchAdapter>
}

// One fresh set per call -- every `state` object above lives only inside
// this function's own closures, never shared with any other call.
export default function createMemoryAdapters(): MemoryAdapters {
  return {
    actorStore: createActorStore(),
    actorCache: createActorCache(),
    eventStore: createEventStore(),
    eventCache: createEventCache(),
    searchAdapter: createSearchAdapter(),
  }
}
