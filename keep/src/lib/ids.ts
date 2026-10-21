import { getBase62Provider } from 'node-flakes'

// One shared, process-wide flake provider -- k-ordered, lexicographically
// sortable base62 ids, per design/tech/tech-stack.md's "node-flakes
// (flake-based ID generation)" choice. Every keep actor that needs a
// generated id (`customer`, `planMapping`, `trial`) uses this instead of
// rolling its own id scheme.
const nextId = getBase62Provider()

export default function generateId(): string {
  return nextId()
}
