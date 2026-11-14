// Keeps `Date.now()` monotonic for the whole test process (vitest
// `setupFiles`, see vitest.config.ts). `node-flakes` 2.1.0 throws
// `NTP clock skew detected` whenever `Date.now()` reads earlier than the
// last id it made (its `now < lastTime` branch), and consequent 2.0.1 calls
// it on every `handle` with no way to inject a clock or an id generator. A
// real backward step of the host's wall clock (WSL2's time sync does this)
// therefore failed an unrelated spec at random (I-0018). Vitest's fake
// timers replace the global `Date` outright, so a spec that uses them
// bypasses this guard, as it should.

/** The process's real `Date.now`, captured before the guard is installed. */
export const realNow: () => number = Date.now.bind(Date)

/** A clock that reads `source` but never earlier than its own last reading. */
export function monotonic(source: () => number): () => number {
  let last = -Infinity
  return () => {
    const now = source()
    if (now > last) last = now
    return last
  }
}

Date.now = monotonic(realNow)
