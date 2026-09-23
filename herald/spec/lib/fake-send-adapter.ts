import type { SendAdapter, SendMessage, SendResult } from '../../src/lib/send-worker.js'

// A scriptable fake implementing the same `SendAdapter` interface a real
// SMTP/SES/SendGrid adapter would (Story 002) -- lets behavior/e2e tests
// exercise the worker's success/transient-failure/permanent-failure
// branches deterministically, with no real network or broker involved.
export class FakeSendAdapter implements SendAdapter {
  public readonly sent: SendMessage[] = []
  private results: SendResult[]
  private callIndex = 0

  constructor(results: SendResult[] = [{ success: true, providerMessageId: 'fake-message-id' }]) {
    this.results = results
  }

  send(message: SendMessage): Promise<SendResult> {
    this.sent.push(message)
    const result = this.results[Math.min(this.callIndex, this.results.length - 1)]
    this.callIndex += 1
    return Promise.resolve(result)
  }
}
