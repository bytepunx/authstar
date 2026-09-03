import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { buildTarGz, type TarFile } from "./tar.js";

const BLOCK_SIZE = 512;

/** Minimal ustar reader -- just enough to verify buildTarGz's own output round-trips. */
function readTar(buf: Buffer): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  while (offset + BLOCK_SIZE <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK_SIZE);
    if (header.every((b) => b === 0)) break; // end-of-archive marker
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeOctal = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeOctal, 8);
    const magic = header.subarray(257, 263).toString("ascii");
    expect(magic).toBe("ustar\0");
    offset += BLOCK_SIZE;
    const content = buf.subarray(offset, offset + size);
    files.push({ path: name, content: Buffer.from(content) });
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return files;
}

describe("buildTarGz", () => {
  it("produces a gzip stream that inflates to a valid ustar archive", () => {
    const files: TarFile[] = [
      { path: "secrets/authstar-platform/chronicle/API_KEY.yaml", content: Buffer.from("sops-ciphertext-1") },
      { path: "secrets/authstar-platform/chronicle/DB_PASSWORD.yaml", content: Buffer.from("sops-ciphertext-2") },
    ];

    const gz = buildTarGz(files);
    const tar = gunzipSync(gz);
    const roundTripped = readTar(tar);

    expect(roundTripped).toHaveLength(2);
    expect(roundTripped[0].path).toBe(files[0].path);
    expect(roundTripped[0].content.toString("utf8")).toBe("sops-ciphertext-1");
    expect(roundTripped[1].path).toBe(files[1].path);
    expect(roundTripped[1].content.toString("utf8")).toBe("sops-ciphertext-2");
  });

  it("pads the archive to a multiple of the 512-byte block size", () => {
    const gz = buildTarGz([{ path: "secrets/a/b/c.yaml", content: Buffer.from("x") }]);
    const tar = gunzipSync(gz);
    expect(tar.length % BLOCK_SIZE).toBe(0);
  });

  it("rejects a path longer than the ustar name field", () => {
    const longPath = "secrets/" + "a".repeat(100) + "/name.yaml";
    expect(() => buildTarGz([{ path: longPath, content: Buffer.from("x") }])).toThrow(/100-byte/);
  });

  it("produces an empty-but-valid archive for zero files", () => {
    const gz = buildTarGz([]);
    const tar = gunzipSync(gz);
    expect(tar.length).toBe(BLOCK_SIZE * 2);
    expect(readTar(tar)).toHaveLength(0);
  });
});
