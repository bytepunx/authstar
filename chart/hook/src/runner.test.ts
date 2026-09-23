import { describe, it, expect, vi } from "vitest";
import { runProvisioning, type Logger } from "./runner.js";
import type { ServiceInput } from "./config.js";
import { createFakeGitOpsClient, notFoundError, fakeServiceError } from "./testing/fakeGitOpsClient.js";

function input(name: ServiceInput["name"]): ServiceInput {
  return { name, signetNamespace: "authstar-platform", signetService: name, config: {}, secrets: {} };
}

function silentLogger(): Logger & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (m) => logs.push(m),
    error: (m) => errors.push(m),
  };
}

const fakeEncrypt = vi.fn(async (_k: string, v: string) => new TextEncoder().encode(v));

describe("runProvisioning", () => {
  it("provisions every service in the fixed order and logs a success summary", async () => {
    const order: ServiceInput["name"][] = [
      "chronicle",
      "herald",
      "keep",
      "lookout",
      "portcullis",
      "steward",
      "tower",
      "web",
    ];
    const client = createFakeGitOpsClient({ getServiceConfigResult: { error: notFoundError() } });
    const logger = silentLogger();

    const results = await runProvisioning(order.map(input), client, fakeEncrypt, logger);

    expect(results.map((r) => r.service)).toEqual(order);
    expect(client.calls.putServiceConfig.length).toBe(8);
    expect(logger.logs.some((l) => l.includes("success"))).toBe(true);
    expect(logger.errors).toHaveLength(0);
  });

  it("stops at the first failure and does not attempt remaining services", async () => {
    let call = 0;
    const client = createFakeGitOpsClient({ getServiceConfigResult: { error: notFoundError() } });
    // Force the second service's PutServiceConfig to fail by swapping the
    // fake's method after the first successful call.
    const originalPut = client.putServiceConfig.bind(client);
    client.putServiceConfig = (request, callback) => {
      call += 1;
      if (call === 2) {
        callback(fakeServiceError(13, "boom"), undefined as never);
        return;
      }
      return originalPut(request, callback);
    };

    const logger = silentLogger();
    const inputs = [input("chronicle"), input("herald"), input("keep")];

    await expect(runProvisioning(inputs, client, fakeEncrypt, logger)).rejects.toMatchObject({
      service: "herald",
      call: "PutServiceConfig",
    });

    // chronicle succeeded, herald failed, keep must never have been attempted.
    expect(client.calls.getServiceConfig.map((r) => r.service)).toEqual(["chronicle", "herald"]);
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toContain("herald");
    expect(logger.errors[0]).toContain("PutServiceConfig");
    expect(logger.logs.some((l) => l.includes("success"))).toBe(false);
  });
});
