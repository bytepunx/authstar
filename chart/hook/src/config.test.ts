import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadServiceInputs, SERVICE_ORDER } from "./config.js";

function writeJson(dir: string, name: string, content: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(content));
  return path;
}

function fullDoc(key: "config" | "secrets", value: unknown) {
  const services: Record<string, unknown> = {};
  for (const name of SERVICE_ORDER) {
    services[name] = { signetNamespace: "authstar-platform", signetService: name, [key]: value };
  }
  return { services };
}

describe("loadServiceInputs", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("returns all 8 services in SERVICE_ORDER, merging config and secrets docs", () => {
    dir = mkdtempSync(join(tmpdir(), "authstar-hook-test-"));
    const configPath = writeJson(dir, "config.json", fullDoc("config", { a: 1 }));
    const secretsPath = writeJson(dir, "secrets.json", fullDoc("secrets", { A: "b" }));

    const inputs = loadServiceInputs(configPath, secretsPath);

    expect(inputs.map((i) => i.name)).toEqual([...SERVICE_ORDER]);
    for (const i of inputs) {
      expect(i.signetNamespace).toBe("authstar-platform");
      expect(i.config).toEqual({ a: 1 });
      expect(i.secrets).toEqual({ A: "b" });
    }
  });

  it("defaults a missing secrets map to {} rather than throwing", () => {
    dir = mkdtempSync(join(tmpdir(), "authstar-hook-test-"));
    const configPath = writeJson(dir, "config.json", fullDoc("config", {}));
    const services: Record<string, unknown> = {};
    for (const name of SERVICE_ORDER) {
      services[name] = { signetNamespace: "authstar-platform", signetService: name };
    }
    const secretsPath = writeJson(dir, "secrets.json", { services });

    const inputs = loadServiceInputs(configPath, secretsPath);

    expect(inputs.every((i) => Object.keys(i.secrets).length === 0)).toBe(true);
  });

  it("throws a clear error when a service is missing from the config document", () => {
    dir = mkdtempSync(join(tmpdir(), "authstar-hook-test-"));
    const doc = fullDoc("config", {});
    delete (doc.services as Record<string, unknown>).web;
    const configPath = writeJson(dir, "config.json", doc);
    const secretsPath = writeJson(dir, "secrets.json", fullDoc("secrets", {}));

    expect(() => loadServiceInputs(configPath, secretsPath)).toThrow(/web/);
  });
});
