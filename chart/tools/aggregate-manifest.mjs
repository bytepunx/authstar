#!/usr/bin/env node
// ADR 0105: aggregates every service's signet-manifest.json (embedded in its published image)
// into one manifest.json at this chart's root. Deliberately dependency-free (no npm install
// needed to run it) -- shells out to `yq` (values.yaml -> JSON) and `crane`+`tar` (extract one
// file from a remote image without a local Docker daemon or full image pull).
//
// Usage:
//   node tools/aggregate-manifest.mjs           # regenerate manifest.json
//   node tools/aggregate-manifest.mjs --check   # fail (exit 1) if manifest.json is stale
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHART_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALUES_PATH = join(CHART_ROOT, "values.yaml");
const MANIFEST_PATH = join(CHART_ROOT, "manifest.json");

// Every top-level values.yaml key that is a per-service subtree, in a fixed order for
// deterministic output (matches the hook's own SERVICE_ORDER in hook/src/config.ts).
const SERVICE_ORDER = ["chronicle", "herald", "keep", "lookout", "portcullis", "steward", "tower", "web"];

function readValues() {
  const json = execFileSync("yq", ["-o=json", VALUES_PATH], { encoding: "utf8" });
  return JSON.parse(json);
}

/** Extracts /signet-manifest.json from `repository:tag` without a local Docker daemon or full
 * image pull. Returns the parsed manifest, or null if the image has none yet (expected for
 * services not onboarded to ADR 0105 yet -- not an error). */
function extractManifest(repository, tag) {
  const ref = `${repository}:${tag}`;
  try {
    const out = execFileSync("sh", ["-c", `crane export '${ref}' - | tar -xO signet-manifest.json`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // A slow/rate-limited registry can hang rather than fail fast (observed against
      // anonymous Docker Hub pulls) -- without a timeout that hangs the whole aggregation run
      // indefinitely instead of skipping this one service.
      timeout: 30_000,
    });
    return JSON.parse(out);
  } catch (err) {
    console.warn(`aggregate-manifest: no signet-manifest.json in ${ref} yet, skipping (${err.message.split("\n")[0]})`);
    return null;
  }
}

function build() {
  const values = readValues();
  const services = {};

  for (const name of SERVICE_ORDER) {
    const svc = values[name];
    if (!svc?.image?.repository || !svc?.image?.tag || !svc?.signet?.namespace) {
      console.warn(`aggregate-manifest: values.${name} missing image/signet coordinates, skipping`);
      continue;
    }

    const manifest = extractManifest(svc.image.repository, svc.image.tag);
    if (!manifest) continue;

    services[name] = {
      signetNamespace: svc.signet.namespace,
      signetService: manifest.service ?? name,
      fields: manifest.fields ?? [],
    };
  }

  return { services };
}

function main() {
  const check = process.argv.includes("--check");
  const aggregated = JSON.stringify(build(), null, 2) + "\n";

  if (check) {
    const existing = (() => {
      try {
        return readFileSync(MANIFEST_PATH, "utf8");
      } catch {
        return null;
      }
    })();
    if (existing !== aggregated) {
      console.error("aggregate-manifest: manifest.json is stale -- run `node tools/aggregate-manifest.mjs` and commit the result.");
      process.exit(1);
    }
    console.log("aggregate-manifest: manifest.json is up to date.");
    return;
  }

  writeFileSync(MANIFEST_PATH, aggregated);
  console.log(`aggregate-manifest: wrote ${MANIFEST_PATH}`);
}

main();
