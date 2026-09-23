// `consequent`'s package only exports its default `initialize` function
// (confirmed against `consequent/dist/index.d.ts` -- no named exports at
// all), so `AdapterLibrary`/`SearchAdapterInstance` aren't importable from
// the package itself even though they're real, documented types in its
// own `types.d.ts`. Redeclared locally, matching that shape exactly.
interface SearchAdapterInstance {
  find: (criteria: Record<string, unknown>[]) => unknown[]
  update: (fieldList: string[], updated: Record<string, unknown>, original: Record<string, unknown>) => Promise<void>
}
interface AdapterLibrary<T> {
  create: (type: string) => Promise<T>
  state?: Record<string, unknown>
}

// A corrected reimplementation of consequent's own default in-memory
// search adapter (`consequent/dist/default/searchAdapter.js`) -- NOT a
// convenience wrapper, a bug fix. Confirmed directly (a standalone repro,
// not assumed) that the real one corrupts its own field index:
// `removeFromFieldIndex`'s "bucket has exactly one id" branch deletes the
// *entire* value bucket (and drops the value from the field's distinct-
// values list) without checking that the one id present is actually the
// id being removed. Every `addFieldValue` call -- which fires on *every*
// searchable field on *every* command, including fields whose value didn't
// change, since consequent always does a redundant remove-then-add of the
// unchanged value -- can trip this. Concretely: create two `communicationType`
// actors (both default to `status: "active"`), then deprecate one -- the
// *other*, untouched actor silently vanishes from the `status: "active"`
// index bucket, because the deprecated actor's own redundant remove-then-
// add of "active" (before moving to "deprecated") finds exactly one id
// in that bucket (the other actor's) and wipes it, mistaking "bucket has
// one id" for "the one id is mine." A `find({ status: "active" })` list
// route then silently returns fewer rows than actually exist -- caught by
// this pilot's own `GET /communication-types` list test, not anticipated
// up front.
//
// This bug lives in the *default in-memory* adapter only -- production
// uses `consequent-postgres`'s real, SQL-backed search implementation, a
// different codebase entirely, so this is a test-fidelity problem, not a
// production correctness problem. Passed explicitly into `initialize()` by
// `in-memory-consequent.ts` so the behavior/e2e tiers get list/filter
// results that are actually correct, and -- as a side benefit -- get a
// search index that's fresh per test file rather than consequent's own
// default, which is a module-level singleton reused across every
// `initialize()` call in the process (see spec/lib/unique.ts for that
// separate finding).

interface FieldIndex {
  values: unknown[]
  ids: Record<string, string[]>
}

type TypeIndex = Record<string, FieldIndex>

function getFieldIndex(state: Record<string, TypeIndex>, type: string, field: string): FieldIndex {
  if (!state[type]) state[type] = {}
  if (!state[type][field]) state[type][field] = { values: [], ids: {} }
  return state[type][field]
}

function addToFieldIndex(fieldIndex: FieldIndex, id: string, value: unknown): void {
  if (!value && value !== 0 && value !== false) return
  const key = String(value)
  if (!fieldIndex.ids[key]) fieldIndex.ids[key] = []
  if (!fieldIndex.ids[key].includes(id)) fieldIndex.ids[key].push(id)
  if (!fieldIndex.values.includes(value)) fieldIndex.values.push(value)
}

// The actual fix: only remove *this specific id* from the bucket, and only
// prune the value from the index once its bucket is genuinely empty --
// never assume "bucket has one entry" means "that entry is mine."
function removeFromFieldIndex(fieldIndex: FieldIndex, id: string, value: unknown): void {
  if (!value && value !== 0 && value !== false) return
  const key = String(value)
  const ids = fieldIndex.ids[key]
  if (!ids) return
  const index = ids.indexOf(id)
  if (index >= 0) ids.splice(index, 1)
  if (ids.length === 0) {
    delete fieldIndex.ids[key]
    const valueIndex = fieldIndex.values.indexOf(value)
    if (valueIndex >= 0) fieldIndex.values.splice(valueIndex, 1)
  }
}

function addFieldValue(state: Record<string, TypeIndex>, type: string, id: string, field: string, before: unknown, after: unknown): void {
  const fieldIndex = getFieldIndex(state, type, field)
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeArr = Array.isArray(before) ? before : []
    const afterArr = Array.isArray(after) ? after : []
    const additions = afterArr.filter((v) => !beforeArr.includes(v))
    const removals = beforeArr.filter((v) => !afterArr.includes(v))
    additions.forEach((v) => addToFieldIndex(fieldIndex, id, v))
    removals.forEach((v) => removeFromFieldIndex(fieldIndex, id, v))
  } else {
    // Always remove-then-add, even when `before === after` -- consequent
    // itself does this unconditionally on every searchable field on every
    // command (dispatch.js calls `search.update` with the full field list
    // regardless of what actually changed), and skipping the "unchanged"
    // case is itself wrong: a field whose *default* state value happens to
    // equal its just-created value (e.g. `status: "active"` is both the
    // schema default and the value `created` sets) would then never get
    // indexed at all on creation. The real bug this file fixes is that the
    // original's `removeFromFieldIndex` used "this bucket has exactly one
    // id" as a proxy for "that id is mine" -- fixed below by checking
    // identity via `indexOf` instead, which makes the redundant remove-
    // then-add pair safe to keep unconditional, matching the original's
    // own structure.
    removeFromFieldIndex(fieldIndex, id, before)
    addToFieldIndex(fieldIndex, id, after)
  }
}

type Predicate = (value: unknown) => boolean

function buildPredicates(criterion: unknown): Predicate[] {
  if (typeof criterion === 'object' && criterion !== null && !Array.isArray(criterion)) {
    const spec = criterion as Record<string, unknown>
    const fns: Predicate[] = []
    if ('contains' in spec) fns.push((v) => Array.isArray(v) && v.includes(spec.contains))
    if ('match' in spec) {
      const rgx = new RegExp(spec.match as string, spec.flags as string | undefined)
      fns.push((v) => v != null && rgx.test(String(v)))
    }
    if ('in' in spec) {
      const list = spec.in as unknown[]
      fns.push((v) => v != null && (Array.isArray(v) ? v.some((x) => list.includes(x)) : list.includes(v)))
    }
    if ('not' in spec) {
      const list = spec.not as unknown[]
      fns.push((v) => v == null || (Array.isArray(v) ? !v.some((x) => list.includes(x)) : !list.includes(v)))
    }
    if ('gt' in spec) fns.push((v) => v != null && (v as number) > (spec.gt as number))
    if ('gte' in spec) fns.push((v) => v != null && (v as number) >= (spec.gte as number))
    if ('lt' in spec) fns.push((v) => v != null && (v as number) < (spec.lt as number))
    if ('lte' in spec) fns.push((v) => v != null && (v as number) <= (spec.lte as number))
    return fns
  } else if (Array.isArray(criterion)) {
    const [lb, ub] = criterion
    return [(v) => v != null && (v as number) > lb && (v as number) < ub]
  }
  return [(v) => v === criterion]
}

function findOneSet(state: Record<string, TypeIndex>, type: string, criteria: Record<string, unknown>): string[] {
  const fields = Object.keys(criteria)
  let ids: string[] | null = null
  for (const field of fields) {
    const predicates = buildPredicates(criteria[field])
    const fieldIndex = getFieldIndex(state, type, field)
    const matchingValues = fieldIndex.values.filter((v) => predicates.every((p) => p(v)))
    const matchedIds = matchingValues.reduce<string[]>((acc, v) => acc.concat(fieldIndex.ids[String(v)] ?? []), [])
    ids = ids === null ? matchedIds : ids.filter((id) => matchedIds.includes(id))
    if (ids.length === 0) break
  }
  return ids ?? []
}

// `consequent-postgres`'s real `SearchAdapter.find` -- the one production
// actually uses -- takes an *array* of criteria sets, OR'd together (each
// set's own fields AND'd), not the single flat object `consequent`'s own
// core type signature (`ConsequentApi.find(type, criteria: Record<string,
// unknown>)`) advertises (confirmed directly: `consequent-postgres/dist/
// search.js`'s `find` does `criteria.forEach(set => ...)` then joins sets
// with `OR`). Passing a flat object crashes it (`criteria.forEach is not a
// function`) -- a real incompatibility between the two "v2" packages this
// pilot caught by actually running the integration tier, not something
// the type signature warned about. Every call site in this codebase
// standardizes on the array shape (even for a single AND'd set, i.e.
// `find(type, [{...}])`) to match production's real adapter; this
// function mirrors that same contract so behavior/e2e tests exercise the
// calling convention real code actually uses, not a shape only the
// default in-memory adapter would have tolerated.
function find(state: Record<string, TypeIndex>, type: string, criteriaSets: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  criteriaSets.forEach((set) => {
    findOneSet(state, type, set).forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id)
        ordered.push(id)
      }
    })
  })
  return ordered
}

function update(state: Record<string, TypeIndex>, type: string, fieldList: string[], updated: Record<string, unknown>, original: Record<string, unknown>): Promise<void> {
  const id = updated.id as string
  fieldList.forEach((field) => {
    addFieldValue(state, type, id, field, original[field], updated[field])
  })
  return Promise.resolve()
}

export default function createFixedInMemorySearchAdapter(): AdapterLibrary<SearchAdapterInstance> {
  const state: Record<string, TypeIndex> = {}
  return {
    state,
    create: (type: string) => Promise.resolve({
      find: find.bind(null, state, type),
      update: update.bind(null, state, type),
    }),
  }
}
