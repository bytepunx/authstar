import { describe, it, expect, vi } from "vitest";
import { provisionService } from "./provision.js";
import { ProvisionError } from "./errors.js";
import type { ServiceInput } from "./config.js";
import { createFakeGitOpsClient, notFoundError, fakeServiceError } from "./testing/fakeGitOpsClient.js";

const baseInput: ServiceInput = {
  name: "chronicle",
  signetNamespace: "authstar-platform",
  signetService: "chronicle",
  config: { clickhouseUrl: "http://clickhouse:8123" },
  secrets: {},
};

const fakeEncrypt = vi.fn(async (_publicKey: string, plaintext: string) =>
  new TextEncoder().encode(`sops-encrypted:${plaintext}`),
);

describe("provisionService", () => {
  it("uses expectedVersion 0 when no config document exists yet (NotFound)", async () => {
    const client = createFakeGitOpsClient({ getServiceConfigResult: { error: notFoundError() } });

    const result = await provisionService(client, fakeEncrypt, baseInput);

    expect(client.calls.getServiceConfig).toHaveLength(1);
    expect(client.calls.putServiceConfig).toHaveLength(1);
    expect(client.calls.putServiceConfig[0].expectedVersion).toBe(0);
    expect(result.configVersion).toBe(1);
    expect(result.secretsChanged).toBe(false);
  });

  it("uses the document's current version as expectedVersion when it already exists", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { response: { content: {}, version: 7 } },
    });

    const result = await provisionService(client, fakeEncrypt, baseInput);

    expect(client.calls.putServiceConfig[0].expectedVersion).toBe(7);
    expect(result.configVersion).toBe(8);
  });

  it("does not call GetSOPSPublicKey or SyncBundle when a service has no secrets", async () => {
    const client = createFakeGitOpsClient({ getServiceConfigResult: { error: notFoundError() } });

    await provisionService(client, fakeEncrypt, { ...baseInput, secrets: {} });

    expect(client.calls.getSopsPublicKey).toHaveLength(0);
    expect(client.calls.syncBundleChunks).toHaveLength(0);
  });

  it("encrypts every secret and pushes a SyncBundle tar.gz under secrets/<namespace>/<service>/<name>.yaml", async () => {
    const client = createFakeGitOpsClient({ getServiceConfigResult: { error: notFoundError() } });
    const input: ServiceInput = {
      ...baseInput,
      secrets: { API_KEY: "s3cr3t", DB_PASSWORD: "hunter2" },
    };

    const result = await provisionService(client, fakeEncrypt, input);

    expect(fakeEncrypt).toHaveBeenCalledWith("age1fake", "s3cr3t");
    expect(fakeEncrypt).toHaveBeenCalledWith("age1fake", "hunter2");
    expect(client.calls.getSopsPublicKey).toHaveLength(1);
    expect(client.calls.syncBundleChunks).toHaveLength(1);

    const chunks = client.calls.syncBundleChunks[0];
    expect(chunks[0].header).toEqual({ secretsPath: "secrets/", headSha: "", configPath: "" });
    expect(chunks[1].data).toBeInstanceOf(Uint8Array);
    expect(result.secretsChanged).toBe(true);
  });

  it("reports secretsChanged=false when SyncBundle makes no changes", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: notFoundError() },
      syncBundleResult: {
        response: { secretsAdded: 0, secretsUpdated: 0, secretsDeleted: 0, syncSha: "", errors: [], configsSynced: 0 },
      },
    });

    const result = await provisionService(client, fakeEncrypt, { ...baseInput, secrets: { A: "b" } });

    expect(result.secretsChanged).toBe(false);
  });

  it("wraps a GetServiceConfig failure (not NotFound) in a ProvisionError naming that call", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: fakeServiceError(13 /* INTERNAL */, "boom") },
    });

    await expect(provisionService(client, fakeEncrypt, baseInput)).rejects.toMatchObject({
      service: "chronicle",
      call: "GetServiceConfig",
    } satisfies Partial<ProvisionError>);
    expect(client.calls.putServiceConfig).toHaveLength(0);
  });

  it("wraps a PutServiceConfig failure in a ProvisionError naming that call", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: notFoundError() },
      putServiceConfigResult: { error: fakeServiceError(10 /* ABORTED */, "version mismatch") },
    });

    await expect(provisionService(client, fakeEncrypt, baseInput)).rejects.toMatchObject({
      service: "chronicle",
      call: "PutServiceConfig",
    } satisfies Partial<ProvisionError>);
  });

  it("wraps a GetSOPSPublicKey failure in a ProvisionError naming that call, without calling SyncBundle", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: notFoundError() },
      getSopsPublicKeyResult: { error: fakeServiceError(13, "boom") },
    });

    await expect(
      provisionService(client, fakeEncrypt, { ...baseInput, secrets: { A: "b" } }),
    ).rejects.toMatchObject({ service: "chronicle", call: "GetSOPSPublicKey" } satisfies Partial<ProvisionError>);
    expect(client.calls.syncBundleChunks).toHaveLength(0);
  });

  it("wraps a SyncBundle failure in a ProvisionError naming that call", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: notFoundError() },
      syncBundleResult: { error: fakeServiceError(13, "sync boom") },
    });

    await expect(
      provisionService(client, fakeEncrypt, { ...baseInput, secrets: { A: "b" } }),
    ).rejects.toMatchObject({ service: "chronicle", call: "SyncBundle" } satisfies Partial<ProvisionError>);
  });

  it("wraps a SyncBundle response carrying `errors` in a ProvisionError naming SyncBundle", async () => {
    const client = createFakeGitOpsClient({
      getServiceConfigResult: { error: notFoundError() },
      syncBundleResult: {
        response: {
          secretsAdded: 0,
          secretsUpdated: 0,
          secretsDeleted: 0,
          syncSha: "",
          errors: ["decrypt failed for A"],
          configsSynced: 0,
        },
      },
    });

    await expect(
      provisionService(client, fakeEncrypt, { ...baseInput, secrets: { A: "b" } }),
    ).rejects.toMatchObject({ service: "chronicle", call: "SyncBundle" } satisfies Partial<ProvisionError>);
  });
});
