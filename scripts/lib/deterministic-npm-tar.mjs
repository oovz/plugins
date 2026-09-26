import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import crossSpawn from "cross-spawn";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function normalizeNpmPackOutput(stdout) {
  let parsed;
  try { parsed = JSON.parse(String(stdout)); } catch (error) { throw new Error(`npm pack returned invalid JSON: ${error.message}`); }
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!result || typeof result !== "object" || typeof result.filename !== "string" || !Array.isArray(result.files)) {
    throw new Error("npm pack returned an incomplete package description");
  }
  return result;
}

function normalizeGzipHeader(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 0x08) throw new Error("npm pack did not produce a gzip archive");
  bytes[4] = 0;
  bytes[5] = 0;
  bytes[6] = 0;
  bytes[7] = 0;
  bytes[8] = 2;
  bytes[9] = 255;
}

function normalizePackageRelative(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}

function writeTarMode(header, mode) {
  const modeText = mode.toString(8).padStart(7, "0") + "\0";
  Buffer.from(modeText, "ascii").copy(header, 100);
  header.fill(0x20, 148, 156);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  const text = checksum.toString(8).padStart(6, "0") + "\0 ";
  Buffer.from(text, "ascii").copy(header, 148);
}

function normalizeArchiveModes(gzipBuffer, executablePaths) {
  if (executablePaths.size === 0) return gzipBuffer;
  const tar = Buffer.from(gunzipSync(gzipBuffer));
  let offset = 0;
  let localPath = null;
  const readHeaderString = (header, start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
  const paxPath = (data) => {
    for (const line of data.toString("utf8").split("\n")) {
      const separator = line.indexOf(" ");
      const equals = line.indexOf("=", separator + 1);
      if (separator > 0 && equals > separator && line.slice(separator + 1, equals) === "path") return line.slice(equals + 1);
    }
    return null;
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(readHeaderString(header, 124, 12).trim() || "0", 8);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const type = String.fromCharCode(header[156] || 0);
    if (type === "x") localPath = paxPath(tar.subarray(dataStart, dataEnd));
    else if (type === "L") localPath = tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0.*$/s, "").replace(/\n$/u, "");
    else {
      const name = localPath ?? readHeaderString(header, 0, 100);
      const prefix = readHeaderString(header, 345, 155);
      const archivePath = name.includes("/") ? name : prefix ? `${prefix}/${name}` : name;
      const relative = archivePath.startsWith("package/") ? archivePath.slice("package/".length) : null;
      if (relative && executablePaths.has(relative)) writeTarMode(header, 0o755);
      localPath = null;
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  const normalized = gzipSync(tar, { level: 9, mtime: 0 });
  normalized[9] = 255;
  return normalized;
}

export function readTarEntriesFromGzip(gzipBuffer) {
  const tar = gunzipSync(gzipBuffer);
  const entries = [];
  let offset = 0;
  let globalPax = {};
  let localPax = null;
  const readString = (header, start, length) => header
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/s, "");
  const parsePax = (data) => {
    const parsed = {};
    let cursor = 0;
    while (cursor < data.length) {
      const lineEnd = data.indexOf(0x0a, cursor);
      if (lineEnd < 0) throw new Error("invalid PAX record without newline");
      const line = data.subarray(cursor, lineEnd).toString("utf8");
      const separator = line.indexOf(" ");
      const equals = line.indexOf("=", separator + 1);
      const declaredLength = Number.parseInt(line.slice(0, separator), 10);
      const payload = line.slice(separator + 1);
      if (separator < 1 || equals < 0 || !Number.isInteger(declaredLength) || declaredLength !== String(declaredLength).length + 1 + Buffer.byteLength(payload) + 1) throw new Error("invalid PAX record length");
      parsed[line.slice(separator + 1, equals)] = line.slice(equals + 1);
      cursor = lineEnd + 1;
    }
    return parsed;
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(readString(header, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) throw new Error("invalid tar entry size");
    const type = String.fromCharCode(header[156] || 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error("truncated tar entry");
    if (type === "x" || type === "g") {
      const pax = parsePax(tar.subarray(dataStart, dataEnd));
      if (type === "g") globalPax = { ...globalPax, ...pax };
      else localPax = { ...globalPax, ...pax };
    } else if (type === "L") {
      localPax = { ...globalPax, path: tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0.*$/s, "").replace(/\n$/u, "") };
    } else {
      const pax = localPax ?? globalPax;
      const name = pax.path ?? readString(header, 0, 100);
      const prefix = readString(header, 345, 155);
      const mode = pax.mode ? Number.parseInt(pax.mode, 8) : Number.parseInt(readString(header, 100, 8).trim() || "0", 8);
      entries.push({
        path: name.includes("/") ? name : prefix ? `${prefix}/${name}` : name,
        mode,
        size,
        content: Buffer.from(tar.subarray(dataStart, dataEnd)),
      });
      localPax = null;
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function createDeterministicNpmTarball({ packageRoot, outputFile }) {
  const destination = path.resolve(outputFile);
  const cache = await mkdtemp(path.join(os.tmpdir(), "oovz-npm-pack-"));
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    const result = crossSpawn.sync(npmExecutable(), ["pack", path.resolve(packageRoot), "--pack-destination", path.dirname(destination), "--json", "--ignore-scripts", "--offline"], {
      cwd: path.resolve(packageRoot),
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, NPM_CONFIG_CACHE: cache },
    });
    if (result.error) throw new Error(`npm pack could not be executed: ${result.error.message}`);
    if ((result.status ?? 1) !== 0) throw new Error(`npm pack failed (${result.status}): ${String(result.stderr ?? "").trim()}`);
    const metadata = normalizeNpmPackOutput(result.stdout);
    const produced = path.resolve(path.dirname(destination), metadata.filename);
    const archive = await readFile(produced);
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const executablePaths = new Set();
    const binValues = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
    for (const value of binValues) executablePaths.add(normalizePackageRelative(value));
    for (const file of metadata.files) {
      const relative = normalizePackageRelative(file.path);
      try {
        const info = await lstat(path.join(packageRoot, ...relative.split("/")));
        if ((info.mode & 0o111) !== 0) executablePaths.add(relative);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const normalized = normalizeArchiveModes(Buffer.from(archive), executablePaths);
    normalizeGzipHeader(normalized);
    if (produced !== destination) await rename(produced, destination);
    await writeFile(destination, normalized);
    return {
      packageName: metadata.name,
      version: metadata.version,
      outputFile: destination,
      sha256: createHash("sha256").update(normalized).digest("hex"),
      files: metadata.files.map((file) => ({ path: `package/${file.path}`, mode: file.mode, size: file.size })),
    };
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
}
