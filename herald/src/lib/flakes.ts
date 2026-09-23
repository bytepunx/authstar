// Thin wrapper around `node-flakes` so callers don't need to know its own
// init/generator shape -- matches the tech-stack doc's "flake-based ID
// generation" convention shared with tower/keep (e.g. tower's `invite.token`).
// `node-flakes`' real exports are provider *factories* (confirmed against
// its own `dist/index.d.ts`, not assumed) -- `getBase62Provider()` returns a
// `() => string` generator, not a ready-made id itself.
import { getBase62Provider } from 'node-flakes'

let generator: (() => string) | null = null

function getGenerator(): () => string {
  if (!generator) {
    generator = getBase62Provider()
  }
  return generator
}

export function nextId(): string {
  return getGenerator()()
}
