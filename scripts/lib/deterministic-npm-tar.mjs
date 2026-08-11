import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const TAR_BLOCK_SIZE = 512;
const FIXED_MTIME_SECONDS = 0;

function writeAscii(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "ascii");
  if (bytes.length > length) throw new Error(`tar field too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0") + "\0";
  writeAscii(buffer, offset, length, text);
}

function splitTarPath(value) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= 100) return { name: value, prefix: "" };
  if (bytes > 255) throw new Error(`tar path exceeds USTAR limit: ${value}`);

  for (let index = value.lastIndexOf("/"); index > 0; index = value.lastIndexOf("/", index - 1)) {
    const prefix = value.slice(0, index);
    const name = value.slice(index + 1);
    if (Buffer.byteLength(name, "utf8") <= 100 && Buffer.byteLength(prefix, "utf8") <= 155) {
      return { name, prefix };
    }
  }
  throw new Error(`tar path cannot be represented in USTAR: ${value}`);
}

function createHeader({ archivePath, size, mode }) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  const { name, prefix } = splitTarPath(archivePath);
  writeAscii(header, 0, 100, name);
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, FIXED_MTIME_SECONDS);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  if (prefix) writeAscii(header, 345, 155, prefix);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, "0") + "\0 ";
  writeAscii(header, 148, 8, checksumText);
  return header;
}

async function collectFiles(root) {
  const files = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) throw new Error(`refusing to package symlink: ${absolute}`);
      if (stats.isDirectory()) await walk(absolute);
      else if (stats.isFile()) files.push(absolute);
      else throw new Error(`unsupported package entry: ${absolute}`);
    }
  }
  await walk(root);
  return files;
}

function normalizePackageRelative(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`invalid package-relative path: ${value}`);
  }
  return normalized;
}

export async function createDeterministicNpmTarball({ packageRoot, outputFile }) {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const binValues = typeof manifest.bin === "string"
    ? [manifest.bin]
    : Object.values(manifest.bin ?? {});
  const executableFiles = new Set(binValues.map(normalizePackageRelative));

  const chunks = [];
  const packagedFiles = [];
  for (const absolutePath of await collectFiles(packageRoot)) {
    const relativePath = normalizePackageRelative(path.relative(packageRoot, absolutePath));
    const archivePath = `package/${relativePath}`;
    const data = await readFile(absolutePath);
    const mode = executableFiles.has(relativePath) ? 0o755 : 0o644;
    chunks.push(createHeader({ archivePath, size: data.length, mode }), data);
    const remainder = data.length % TAR_BLOCK_SIZE;
    if (remainder !== 0) chunks.push(Buffer.alloc(TAR_BLOCK_SIZE - remainder, 0));
    packagedFiles.push({ path: archivePath, mode, size: data.length });
  }
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2, 0));

  const tar = Buffer.concat(chunks);
  const gzip = gzipSync(tar, { level: 9, mtime: 0 });
  // RFC 1952 byte 9 is the originating OS. Normalize it so Linux and Windows
  // produce byte-identical release archives.
  gzip[9] = 255;

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, gzip);
  return {
    packageName: manifest.name,
    version: manifest.version,
    outputFile,
    sha256: createHash("sha256").update(gzip).digest("hex"),
    files: packagedFiles,
  };
}

export function readTarEntriesFromGzip(gzipBuffer) {
  const tar = gunzipSync(gzipBuffer);
  const entries = [];
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break;
    const readString = (start, length) => header
      .subarray(start, start + length)
      .toString("utf8")
      .replace(/\0.*$/s, "");
    const name = readString(0, 100);
    const prefix = readString(345, 155);
    const size = Number.parseInt(readString(124, 12).trim() || "0", 8);
    const mode = Number.parseInt(readString(100, 8).trim() || "0", 8);
    entries.push({ path: prefix ? `${prefix}/${name}` : name, mode, size });
    offset += TAR_BLOCK_SIZE + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }
  return entries;
}
