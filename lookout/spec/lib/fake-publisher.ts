import type { Publisher } from '../../src/lib/publisher.js'

export interface PublishedMessage {
  routingKey: string
  message: Record<string, unknown>
}

export interface FakePublisher extends Publisher {
  published: PublishedMessage[]
}

// Records every publish call in-process -- used by the behavior and e2e
// tiers, neither of which touches a real broker (that's the integration
// tier's job, spec/integration/events.integration.spec.ts).
export function createFakePublisher(): FakePublisher {
  const published: PublishedMessage[] = []
  return {
    published,
    async publish(routingKey: string, message: Record<string, unknown>): Promise<void> {
      published.push({ routingKey, message })
    },
  }
}
