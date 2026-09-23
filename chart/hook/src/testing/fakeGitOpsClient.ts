// Hand-written fake of the callback-style GitOpsServiceClient surface this
// hook depends on (see provision.ts's GitOpsClientLike). No real network or
// signet instance is used anywhere in this package's test suite -- tests
// configure this fake's canned responses/errors and assert on the calls it
// recorded, mirroring the "fake the dependency, assert on calls" style.
import type { ServiceError, ClientWritableStream } from "@grpc/grpc-js";
import { status as grpcStatus } from "@grpc/grpc-js";
import type { adminv1 } from "@bytepunx/signet-client";
import type { GitOpsClientLike } from "../provision.js";

export function fakeServiceError(code: number, message = "fake error"): ServiceError {
  const err = new Error(message) as unknown as ServiceError;
  (err as unknown as { code: number }).code = code;
  return err;
}

export const notFoundError = (): ServiceError => fakeServiceError(grpcStatus.NOT_FOUND, "not found");

export interface FakeGitOpsClientOptions {
  getServiceConfigResult?: { error?: ServiceError; response?: adminv1.GetServiceConfigResponse };
  putServiceConfigResult?: { error?: ServiceError; response?: adminv1.PutServiceConfigResponse };
  getSopsPublicKeyResult?: { error?: ServiceError; response?: adminv1.GetSOPSPublicKeyResponse };
  syncBundleResult?: { error?: ServiceError; response?: adminv1.SyncBundleResponse };
}

export interface FakeGitOpsClient extends GitOpsClientLike {
  calls: {
    getServiceConfig: adminv1.GetServiceConfigRequest[];
    putServiceConfig: adminv1.PutServiceConfigRequest[];
    getSopsPublicKey: adminv1.GetSOPSPublicKeyRequest[];
    syncBundleChunks: adminv1.SyncBundleChunk[][];
  };
}

/** Builds a fake ClientWritableStream that records writes and replies via `callback` once `.end()` is called. */
function fakeWritableStream(
  onEnd: (chunks: adminv1.SyncBundleChunk[]) => void,
): ClientWritableStream<adminv1.SyncBundleChunk> {
  const chunks: adminv1.SyncBundleChunk[] = [];
  const stream = {
    write(chunk: adminv1.SyncBundleChunk) {
      chunks.push(chunk);
      return true;
    },
    end() {
      onEnd(chunks);
    },
    on() {
      return stream;
    },
  };
  return stream as unknown as ClientWritableStream<adminv1.SyncBundleChunk>;
}

export function createFakeGitOpsClient(options: FakeGitOpsClientOptions = {}): FakeGitOpsClient {
  const calls: FakeGitOpsClient["calls"] = {
    getServiceConfig: [],
    putServiceConfig: [],
    getSopsPublicKey: [],
    syncBundleChunks: [],
  };

  const client: FakeGitOpsClient = {
    calls,
    getServiceConfig(request, callback) {
      calls.getServiceConfig.push(request);
      const result = options.getServiceConfigResult ?? { response: { content: {}, version: 0 } };
      queueMicrotask(() => callback(result.error ?? null, result.response as adminv1.GetServiceConfigResponse));
    },
    putServiceConfig(request, callback) {
      calls.putServiceConfig.push(request);
      const result = options.putServiceConfigResult ?? { response: { version: request.expectedVersion + 1 } };
      queueMicrotask(() => callback(result.error ?? null, result.response as adminv1.PutServiceConfigResponse));
    },
    getSopsPublicKey(request, callback) {
      calls.getSopsPublicKey.push(request);
      const result = options.getSopsPublicKeyResult ?? {
        response: { publicKey: "age1fake", fingerprint: "fake", createdAt: "", environment: "" },
      };
      queueMicrotask(() => callback(result.error ?? null, result.response as adminv1.GetSOPSPublicKeyResponse));
    },
    syncBundle(callback) {
      return fakeWritableStream((chunks) => {
        calls.syncBundleChunks.push(chunks);
        const result = options.syncBundleResult ?? {
          response: { secretsAdded: 1, secretsUpdated: 0, secretsDeleted: 0, syncSha: "", errors: [], configsSynced: 0 },
        };
        queueMicrotask(() => callback(result.error ?? null, result.response as adminv1.SyncBundleResponse));
      });
    },
  };

  return client;
}
