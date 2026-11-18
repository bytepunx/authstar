import { describe, expect, it } from 'vitest'
import { acquireLockWithStream, signetv1, type Lock, type LockStream } from '@bytepunx/signet-client'
import { shutDownForRestart, type RestartLogger } from '../../src/lib/restart-on-bundle-change.js'

// I-0039, the cause of I-0029: signet's `holdLock` ends a lock stream only
// when the RPC's context is cancelled, never on the client's half-close, so
// signet-client's `Lock.release()` (half-close, then wait for the stream to
// end) never resolves. These specs drive the client's real `Lock` over a fake
// stream that behaves as signet's server does.

const ACQUIRED: signetv1.AcquireRestartLockResponse = {
  messageType: signetv1.AcquireRestartLockResponse_MessageType.MESSAGE_TYPE_ACQUIRED,
  position: 0,
  token: 'test-token',
  expiresAt: undefined,
}

// Answers ACQUIRED, then never ends the stream: closeSend() changes nothing.
function signetLikeStream(): LockStream {
  let first = true
  return {
    send() {},
    recv() {
      if (first) {
        first = false
        return Promise.resolve(ACQUIRED)
      }
      return new Promise(() => {})
    },
    closeSend() {},
  }
}

// Answers ACQUIRED, then ends the stream as soon as the client half-closes.
function endingStream(): LockStream {
  let first = true
  let end: ((err: Error) => void) | undefined
  return {
    send() {},
    recv() {
      if (first) {
        first = false
        return Promise.resolve(ACQUIRED)
      }
      return new Promise((_, reject) => { end = reject })
    },
    closeSend() { end?.(new Error('stream ended')) },
  }
}

// A heartbeat interval longer than any test, so no heartbeat is sent; release() stops it.
function lockOver(stream: LockStream): Promise<Lock> {
  return acquireLockWithStream(stream, 'ns', 'keep', 30, { heartbeatIntervalMs: 60_000 })
}

function recordingLogger(): RestartLogger & { entries: { level: string, obj: Record<string, unknown> }[] } {
  const entries: { level: string, obj: Record<string, unknown> }[] = []
  return {
    entries,
    info(obj) { entries.push({ level: 'info', obj }) },
    warn(obj) { entries.push({ level: 'warn', obj }) },
  }
}

const settlesWithin = (p: Promise<unknown>, ms: number): Promise<boolean> =>
  Promise.race([p.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))])

describe('restart on a bundle change', () => {
  it('reproduces the hang: lock.release() alone never settles against signet', async () => {
    const lock = await lockOver(signetLikeStream())
    expect(await settlesWithin(lock.release(), 100)).toBe(false)
  })

  it('returns within the release timeout and warns when signet does not end the stream', async () => {
    const lock = await lockOver(signetLikeStream())
    const log = recordingLogger()
    const started = Date.now()

    await shutDownForRestart({ close: async () => {}, lock, log, releaseTimeoutMs: 50 })

    expect(Date.now() - started).toBeLessThan(1000)
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.level).toBe('warn')
    expect(log.entries[0]?.obj).toMatchObject({ timeout_ms: 50 })
    expect(log.entries[0]?.obj.elapsed_ms).toEqual(expect.any(Number))
  })

  it('returns at once and logs info when the stream ends on release', async () => {
    const lock = await lockOver(endingStream())
    const log = recordingLogger()
    const started = Date.now()

    await shutDownForRestart({ close: async () => {}, lock, log, releaseTimeoutMs: 5_000 })

    expect(Date.now() - started).toBeLessThan(1000)
    expect(log.entries.map((e) => e.level)).toEqual(['info'])
    expect(log.entries[0]?.obj.elapsed_ms).toEqual(expect.any(Number))
  })

  it('warns with the error and does not throw when the release fails', async () => {
    const log = recordingLogger()
    const err = new Error('release failed')

    await shutDownForRestart({ close: async () => {}, lock: { release: () => Promise.reject(err) }, log, releaseTimeoutMs: 5_000 })

    expect(log.entries.map((e) => e.level)).toEqual(['warn'])
    expect(log.entries[0]?.obj.err).toBe(err)
  })

  it('closes the app before it releases the lock', async () => {
    const order: string[] = []
    const close = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('close')
    }
    const lock = { release: async (): Promise<void> => { order.push('release') } }

    await shutDownForRestart({ close, lock, log: recordingLogger() })

    expect(order).toEqual(['close', 'release'])
  })
})
