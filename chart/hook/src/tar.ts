// Minimal in-memory POSIX ustar tar.gz builder.
//
// SyncBundle's "local bundle sync" path (see @bytepunx/signet-client's
// README and signet's docs/secrets-workflow.md) expects a tar.gz of a git
// working tree layout, not a per-key API -- files must sit at
// `secrets/<namespace>/<service>/<name>.yaml`. We only ever need to push a
// handful of small, known files per service, so a hand-rolled ustar writer
// (no directory entries, no long-name/prefix support, no permissions
// fidelity -- none of that is exercised by anything this hook pushes) is
// simpler and dependency-free compared to pulling in a general-purpose tar
// library for one call site.
import { gzipSync } from "node:zlib";

export interface TarFile {
  path: string;
  content: Buffer;
}

const BLOCK_SIZE = 512;

function octalField(value: number, fieldLength: number): string {
  // fieldLength includes the trailing NUL ustar expects.
  return value.toString(8).padStart(fieldLength - 1, "0") + "\0";
}

function buildHeader(path: string, size: number, mtimeSeconds: number): Buffer {
  if (Buffer.byteLength(path, "utf8") > 100) {
    throw new Error(`tar.ts: entry path exceeds the 100-byte ustar name field: ${path}`);
  }

  const header = Buffer.alloc(BLOCK_SIZE);
  header.write(path, 0, 100, "utf8");
  header.write(octalField(0o644, 8), 100, 8, "ascii"); // mode
  header.write(octalField(0, 8), 108, 8, "ascii"); // uid
  header.write(octalField(0, 8), 116, 8, "ascii"); // gid
  header.write(octalField(size, 12), 124, 12, "ascii"); // size
  header.write(octalField(mtimeSeconds, 12), 136, 12, "ascii"); // mtime
  header.write("        ", 148, 8, "ascii"); // checksum placeholder: 8 spaces
  header.write("0", 156, 1, "ascii"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "ascii"); // magic
  header.write("00", 263, 2, "ascii"); // version

  let checksum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) checksum += header[i];
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

  return header;
}

function padToBlock(buf: Buffer): Buffer {
  const remainder = buf.length % BLOCK_SIZE;
  if (remainder === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(BLOCK_SIZE - remainder)]);
}

/** Builds a gzip-compressed ustar tar archive containing exactly `files`. */
export function buildTarGz(files: TarFile[], mtimeSeconds = Math.floor(Date.now() / 1000)): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(buildHeader(file.path, file.content.length, mtimeSeconds));
    parts.push(padToBlock(file.content));
  }
  // End-of-archive marker: two consecutive zero-filled blocks.
  parts.push(Buffer.alloc(BLOCK_SIZE * 2));
  return gzipSync(Buffer.concat(parts));
}
