// Thin publisher interface -- the one seam between the HTTP layer and
// RabbitMQ. Real callers get `createAmqpPublisher` (amqp-publisher.ts);
// behavior/e2e tests fake this interface entirely (spec/lib/fake-publisher.ts)
// so those tiers never touch a real broker, per Story 001's "validate then
// publish, that's the whole service" scope.
export interface Publisher {
  publish(routingKey: string, message: Record<string, unknown>): Promise<void>
}
