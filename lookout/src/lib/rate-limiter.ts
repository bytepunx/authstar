// Fixed-window in-memory limiter. lookout is stateless and has no database
// (Story 001) -- this is deliberately process-local, not shared across
// replicas. Good enough for the per-tenant/application/identityHash scoping
// Story 001 asks for; a shared limiter (e.g. Redis-backed) is future work
// if per-replica drift ever actually matters in practice, not designed here.
export interface RateLimiter {
  // Returns true if the call is allowed (and consumes one unit of budget),
  // false if the caller is over the limit for this key's current window.
  consume(key: string): boolean
}

export interface RateLimiterOptions {
  maxRequests: number
  windowMs: number
}

export function createInMemoryRateLimiter(options: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>()

  return {
    consume(key: string): boolean {
      const now = Date.now()
      const windowStart = now - options.windowMs
      const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart)

      if (recent.length >= options.maxRequests) {
        hits.set(key, recent)
        return false
      }

      recent.push(now)
      hits.set(key, recent)
      return true
    },
  }
}

// Always-allow limiter -- used by behavior/e2e tests that aren't exercising
// rate-limit rejection itself, so a shared default limit can't make an
// unrelated test flaky under load.
export function createNoopRateLimiter(): RateLimiter {
  return {
    consume(): boolean {
      return true
    },
  }
}
