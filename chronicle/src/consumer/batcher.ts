export interface BatcherOptions<T> {
  maxSize: number
  maxWaitMs: number
  flush: (items: T[]) => Promise<void>
  onFlushError?: (error: unknown, items: T[]) => void
}

// Batches inserts rather than one write per message (Story 001) --
// ClickHouse is materially more efficient with batched writes. A bounded
// window (a few hundred rows, or a few seconds, whichever comes first).
// Deliberately simple: a flush failure is logged via `onFlushError` and the
// batch is dropped, never retried indefinitely -- consistent with this
// pipeline's already-accepted loss-tolerant posture (ADR 0035).
export default class Batcher<T> {
  private buffer: T[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: BatcherOptions<T>) {}

  get size(): number {
    return this.buffer.length
  }

  add(item: T): void {
    this.buffer.push(item)
    if (this.buffer.length >= this.options.maxSize) {
      void this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.options.maxWaitMs)
      this.timer.unref?.()
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.buffer.length === 0) return
    const items = this.buffer
    this.buffer = []
    try {
      await this.options.flush(items)
    } catch (error) {
      this.options.onFlushError?.(error, items)
    }
  }

  async close(): Promise<void> {
    await this.flush()
  }
}
