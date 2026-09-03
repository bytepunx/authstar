import { readFileSync } from "node:fs";

// Fixed provisioning order (Story 001, Provisioning hook section) -- the
// hook enforces this itself rather than trusting the ConfigMap/Secret's own
// JSON key order (object key order isn't a JSON guarantee worth relying on
// for something this load-bearing).
export const SERVICE_ORDER = [
  "chronicle",
  "herald",
  "keep",
  "lookout",
  "portcullis",
  "steward",
  "tower",
  "web",
] as const;

export type ServiceName = (typeof SERVICE_ORDER)[number];

export interface ServiceInput {
  name: ServiceName;
  signetNamespace: string;
  signetService: string;
  config: unknown;
  secrets: Record<string, unknown>;
}

interface ConfigDocEntry {
  signetNamespace: string;
  signetService: string;
  config: unknown;
}

interface ConfigDoc {
  services: Record<string, ConfigDocEntry>;
}

interface SecretsDocEntry {
  signetNamespace: string;
  signetService: string;
  secrets: Record<string, unknown>;
}

interface SecretsDoc {
  services: Record<string, SecretsDocEntry>;
}

/**
 * Loads and merges templates/hook-configmap.yaml's config.json and
 * templates/hook-secret.yaml's secrets.json into one ordered list of
 * per-service inputs, in SERVICE_ORDER.
 */
export function loadServiceInputs(configPath: string, secretsPath: string): ServiceInput[] {
  const configDoc = JSON.parse(readFileSync(configPath, "utf8")) as ConfigDoc;
  const secretsDoc = JSON.parse(readFileSync(secretsPath, "utf8")) as SecretsDoc;

  return SERVICE_ORDER.map((name) => {
    const configEntry = configDoc.services?.[name];
    const secretsEntry = secretsDoc.services?.[name];
    if (!configEntry) {
      throw new Error(`config.ts: missing config entry for service "${name}" in ${configPath}`);
    }
    if (!secretsEntry) {
      throw new Error(`config.ts: missing secrets entry for service "${name}" in ${secretsPath}`);
    }
    return {
      name,
      signetNamespace: configEntry.signetNamespace,
      signetService: configEntry.signetService,
      config: configEntry.config,
      secrets: secretsEntry.secrets ?? {},
    };
  });
}
