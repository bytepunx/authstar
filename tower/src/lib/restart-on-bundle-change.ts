// The restart-lock branch of `server.ts`: close the app, release signet's
// restart lock, and return so the process can exit for Kubernetes to restart.
//
// The release is bounded (I-0039, the cause of I-0029). `@bytepunx/signet-client`
// 0.9.0's `Lock.release()` half-closes the lock stream and waits for the
// server to end it, but signet's `holdLock` returns only when the RPC's
// context is cancelled, which a half-close does not do. Unbounded, the
// release never resolves and tower stays up with its port closed until the
// liveness probe kills it, about 25s later. Exiting after the bound closes
// the connection to signet, which cancels the RPC and frees the lock at once.

/** How long the restart path waits for signet to end the lock stream before exiting anyway. */
export const RESTART_LOCK_RELEASE_TIMEOUT_MS = 2000

/** The part of a signet restart lock the restart path needs. */
export interface ReleasableLock {
  release(): Promise<void>
}

/** The pino-style logger the restart path logs through; Fastify's `app.log` is one. */
export interface RestartLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
}

export interface ShutDownForRestartOptions {
  close: () => Promise<void>
  lock: ReleasableLock
  log: RestartLogger
  releaseTimeoutMs?: number
}

type ReleaseOutcome = { kind: 'released' } | { kind: 'failed', err: unknown } | { kind: 'timed-out' }

/** Closes the app, then releases the restart lock, waiting at most the release timeout. */
export async function shutDownForRestart(opts: ShutDownForRestartOptions): Promise<void> {
  const timeoutMs = opts.releaseTimeoutMs ?? RESTART_LOCK_RELEASE_TIMEOUT_MS
  await opts.close()

  const started = Date.now()
  let timer: NodeJS.Timeout | undefined
  const outcome = await Promise.race<ReleaseOutcome>([
    opts.lock.release().then(
      () => ({ kind: 'released' as const }),
      (err: unknown) => ({ kind: 'failed' as const, err }),
    ),
    new Promise<ReleaseOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timed-out' }), timeoutMs)
    }),
  ])
  clearTimeout(timer)

  const elapsed_ms = Date.now() - started
  switch (outcome.kind) {
    case 'released':
      opts.log.info({ elapsed_ms }, 'restart lock released')
      break
    case 'failed':
      opts.log.warn({ elapsed_ms, err: outcome.err }, 'restart lock release failed -- exiting; signet frees the lock when the connection closes')
      break
    case 'timed-out':
      opts.log.warn({ elapsed_ms, timeout_ms: timeoutMs }, 'restart lock release timed out -- exiting; signet frees the lock when the connection closes')
      break
  }
}
