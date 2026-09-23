import type { ServiceError, ClientWritableStream } from "@grpc/grpc-js";
import { status as grpcStatus } from "@grpc/grpc-js";
import type { adminv1 } from "@bytepunx/signet-client";

import { buildTarGz } from "./tar.js";
import { ProvisionError } from "./errors.js";
import type { ServiceInput } from "./config.js";

/**
 * The narrow slice of GitOpsServiceClient's callback-style API this hook
 * actually calls. A real `@bytepunx/signet-client` `gitOpsClient(...)`
 * satisfies this structurally; tests substitute a hand-written fake -- no
 * real network or signet instance is used anywhere in this package's test
 * suite.
 */
export interface GitOpsClientLike {
  getServiceConfig(
    request: adminv1.GetServiceConfigRequest,
    callback: (error: ServiceError | null, response: adminv1.GetServiceConfigResponse) => void,
  ): unknown;
  putServiceConfig(
    request: adminv1.PutServiceConfigRequest,
    callback: (error: ServiceError | null, response: adminv1.PutServiceConfigResponse) => void,
  ): unknown;
  getSopsPublicKey(
    request: adminv1.GetSOPSPublicKeyRequest,
    callback: (error: ServiceError | null, response: adminv1.GetSOPSPublicKeyResponse) => void,
  ): unknown;
  syncBundle(
    callback: (error: ServiceError | null, response: adminv1.SyncBundleResponse) => void,
  ): ClientWritableStream<adminv1.SyncBundleChunk>;
}

export type EncryptForSecret = (publicKeyBech32: string, plaintext: string) => Promise<Uint8Array>;

export interface ProvisionResult {
  service: string;
  configVersion: number;
  secretsChanged: boolean;
}

function callUnary<Req, Res>(
  method: (request: Req, callback: (error: ServiceError | null, response: Res) => void) => unknown,
  request: Req,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    method(request, (error, response) => (error ? reject(error) : resolve(response)));
  });
}

async function currentVersion(client: GitOpsClientLike, namespace: string, service: string): Promise<number> {
  try {
    const resp = await callUnary(client.getServiceConfig.bind(client), { namespace, service });
    return resp.version;
  } catch (err) {
    const serviceErr = err as Partial<ServiceError> | undefined;
    if (serviceErr && serviceErr.code === grpcStatus.NOT_FOUND) {
      // No document exists yet -- PutServiceConfig's create-only path
      // (expectedVersion: 0) is what we want.
      return 0;
    }
    throw err;
  }
}

function writeSyncBundle(
  client: GitOpsClientLike,
  header: adminv1.SyncBundleHeader,
  tarball: Buffer,
): Promise<adminv1.SyncBundleResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const call = client.syncBundle((error, response) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(response);
    });
    call.write({ header });
    call.write({ data: tarball });
    call.end();
  });
}

/**
 * Provisions one service, per Story 001's Provisioning hook section:
 *
 *  1. GetServiceConfig to learn the current version (NotFound -> 0), then
 *     PutServiceConfig with that expectedVersion -- create-or-replace,
 *     idempotent and safe to re-run.
 *  2. If this service has any secrets, GetSOPSPublicKey, SOPS-encrypt each
 *     secret value client-side, and SyncBundle a tar.gz of
 *     `secrets/<namespace>/<service>/<name>.yaml` entries.
 *
 * On the first failing call, throws ProvisionError naming the service and
 * call that failed -- callers must not attempt remaining services (see
 * runner.ts).
 */
export async function provisionService(
  client: GitOpsClientLike,
  encrypt: EncryptForSecret,
  input: ServiceInput,
): Promise<ProvisionResult> {
  let expectedVersion: number;
  try {
    expectedVersion = await currentVersion(client, input.signetNamespace, input.signetService);
  } catch (err) {
    throw new ProvisionError(input.name, "GetServiceConfig", err);
  }

  let configVersion: number;
  try {
    const putResp = await callUnary(client.putServiceConfig.bind(client), {
      namespace: input.signetNamespace,
      service: input.signetService,
      content: input.config,
      expectedVersion,
    });
    configVersion = putResp.version;
  } catch (err) {
    throw new ProvisionError(input.name, "PutServiceConfig", err);
  }

  const secretEntries = Object.entries(input.secrets ?? {});
  let secretsChanged = false;

  if (secretEntries.length > 0) {
    let publicKey: string;
    try {
      const keyResp = await callUnary(client.getSopsPublicKey.bind(client), {});
      publicKey = keyResp.publicKey;
    } catch (err) {
      throw new ProvisionError(input.name, "GetSOPSPublicKey", err);
    }

    try {
      const files = [];
      for (const [name, value] of secretEntries) {
        const plaintext = typeof value === "string" ? value : JSON.stringify(value);
        const encrypted = await encrypt(publicKey, plaintext);
        files.push({
          path: `secrets/${input.signetNamespace}/${input.signetService}/${name}.yaml`,
          content: Buffer.from(encrypted),
        });
      }
      const tarball = buildTarGz(files);

      const syncResp = await writeSyncBundle(client, { secretsPath: "secrets/", headSha: "", configPath: "" }, tarball);
      if (syncResp.errors && syncResp.errors.length > 0) {
        throw new Error(syncResp.errors.join("; "));
      }
      secretsChanged = syncResp.secretsAdded > 0 || syncResp.secretsUpdated > 0 || syncResp.secretsDeleted > 0;
    } catch (err) {
      throw new ProvisionError(input.name, "SyncBundle", err);
    }
  }

  return { service: input.name, configVersion, secretsChanged };
}
