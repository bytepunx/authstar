import type { ConsumerChannel } from '../../src/consumer/message-handler.js'

export interface FakeMessage {
  id: string
}

// A fake broker channel/message pair for the consumer's behavior tier --
// no real amqplib connection involved, just enough surface
// (`ack`/`nack`) to assert what the message handler decided to do with
// each message.
export default class FakeChannel implements ConsumerChannel<FakeMessage> {
  readonly acked: FakeMessage[] = []
  readonly nacked: Array<{ message: FakeMessage; allUpTo: boolean; requeue: boolean }> = []

  ack(message: FakeMessage): void {
    this.acked.push(message)
  }

  nack(message: FakeMessage, allUpTo: boolean, requeue: boolean): void {
    this.nacked.push({ message, allUpTo, requeue })
  }
}

let counter = 0
export function fakeMessage(): FakeMessage {
  counter += 1
  return { id: `msg-${counter}` }
}
