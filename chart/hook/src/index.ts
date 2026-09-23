// Entrypoint for authstar-chart's pre-install,pre-upgrade provisioning
// hook Job (templates/hook-job.yaml). See ADR 0104 and Story 001 in
// bytepunx/authstar-design for the design this implements.
import { gitOpsClient, encryptForSecret } from "@bytepunx/signet-client";

import { loadServiceInputs } from "./config.js";
import { consoleLogger, runProvisioning } from "./runner.js";
import { ProvisionError } from "./errors.js";
import type { GitOpsClientLike } from "./provision.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env var ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const signetAdminAddr = requireEnv("SIGNET_ADMIN_ADDR");
  const signetAdminToken = requireEnv("SIGNET_ADMIN_TOKEN");
  const configPath = process.env.HOOK_CONFIG_PATH ?? "/etc/authstar-hook/config.json";
  const secretsPath = process.env.HOOK_SECRETS_PATH ?? "/etc/authstar-hook/secrets.json";

  const inputs = loadServiceInputs(configPath, secretsPath);

  // signet's in-cluster admin listener (values.hook.signetAdminAddr, a
  // ClusterIP DNS name) is plaintext-behind-bearer-token today, not
  // TLS-terminated -- `plaintext: true` is required, matching
  // @bytepunx/signet-client's README.
  const rawClient = gitOpsClient({ address: signetAdminAddr, token: signetAdminToken, plaintext: true });

  try {
    await runProvisioning(inputs, rawClient as unknown as GitOpsClientLike, encryptForSecret, consoleLogger);
  } finally {
    rawClient.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    // runProvisioning already logged which service+call failed via
    // consoleLogger; this is the final fatal line plus the non-zero exit
    // that fails the Helm release.
    if (err instanceof ProvisionError) {
      console.error(`authstar-provision: fatal: ${err.message}`);
    } else {
      console.error(`authstar-provision: fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
    process.exit(1);
  });
