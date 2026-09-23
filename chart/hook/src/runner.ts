import { ProvisionError } from "./errors.js";
import { provisionService, type EncryptForSecret, type GitOpsClientLike, type ProvisionResult } from "./provision.js";
import type { ServiceInput } from "./config.js";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  log: (message) => console.log(`authstar-provision: ${message}`),
  error: (message) => console.error(`authstar-provision: ${message}`),
};

/**
 * Runs provisionService for every input in order, stopping immediately on
 * the first failure (Story 001: "does not attempt remaining services").
 * Already-succeeded services' pushes are left in place -- both signet RPCs
 * are independently idempotent per service, so re-running the whole hook
 * (e.g. via a retried `helm upgrade`) is safe.
 */
export async function runProvisioning(
  inputs: ServiceInput[],
  client: GitOpsClientLike,
  encrypt: EncryptForSecret,
  logger: Logger = consoleLogger,
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];

  for (const input of inputs) {
    logger.log(`provisioning ${input.name} (signet namespace=${input.signetNamespace})...`);
    let result: ProvisionResult;
    try {
      result = await provisionService(client, encrypt, input);
    } catch (err) {
      if (err instanceof ProvisionError) {
        logger.error(`service "${err.service}" failed at ${err.call}: ${err.message}`);
      } else {
        logger.error(`service "${input.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    }
    logger.log(`${input.name}: config version=${result.configVersion}, secrets changed=${result.secretsChanged}`);
    results.push(result);
  }

  logger.log(`success -- provisioned ${results.length} service(s):`);
  for (const result of results) {
    logger.log(`  - ${result.service}: config version=${result.configVersion}, secrets changed=${result.secretsChanged}`);
  }

  return results;
}
