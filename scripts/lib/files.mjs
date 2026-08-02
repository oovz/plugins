import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertRelative, within } from "./marketplace.mjs";

async function nearestExisting(target) {
  let current = path.resolve(target);
  while (true) {
    try { await lstat(current); return current; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`no existing ancestor for ${target}`);
    current = parent;
  }
}

export async function assertNoSymlinkAncestors(target, containmentRoot) {
  const absolute = within(containmentRoot, target, "generated path");
  const root = path.resolve(containmentRoot);
  const start = await nearestExisting(root);
  let current = start;
  const relative = path.relative(start, absolute);
  for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`refusing symlink in generated path: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export async function atomicWriteTree(target, artifacts, containmentRoot) {
  const absoluteTarget = within(containmentRoot, target, "generated target");
  await assertNoSymlinkAncestors(absoluteTarget, containmentRoot);
  const parent = path.dirname(absoluteTarget);
  await mkdir(parent, { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const staging = path.join(parent, `.${path.basename(target)}.staging-${token}`);
  const backup = path.join(parent, `.${path.basename(target)}.backup-${token}`);
  await mkdir(staging, { recursive: false });
  try {
    for (const artifact of artifacts) {
      const relative = assertRelative(artifact.path, "generated artifact");
      const destination = within(staging, path.join(staging, relative), "generated artifact");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, artifact.content, { mode: artifact.executable ? 0o755 : 0o644 });
    }
    let backedUp = false;
    try {
      await rename(absoluteTarget, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, absoluteTarget);
    } catch (error) {
      if (backedUp) await rename(backup, absoluteTarget);
      throw error;
    }
    if (backedUp) await rm(backup, { recursive: true, force: true }).catch(() => {});
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    throw error;
  }
}

export async function atomicWriteFile(file, content, containmentRoot) {
  const absolute = within(containmentRoot, file, "generated file");
  await assertNoSymlinkAncestors(absolute, containmentRoot);
  await mkdir(path.dirname(absolute), { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.tmp-${token}`);
  const backup = path.join(path.dirname(absolute), `.${path.basename(absolute)}.backup-${token}`);
  await writeFile(temporary, content, { flag: "wx" });
  let backedUp = false;
  try {
    try { await rename(absolute, backup); backedUp = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await rename(temporary, absolute); } catch (error) {
      if (backedUp) await rename(backup, absolute);
      throw error;
    }
    if (backedUp) await rm(backup, { force: true }).catch(() => {});
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readTree(directory) {
  const artifacts = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) artifacts.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: await readFile(absolute), executable: ((await stat(absolute)).mode & 0o111) !== 0 });
      else throw new Error(`unexpected generated entry ${absolute}`);
    }
  }
  try {
    await assertNoSymlinkAncestors(directory, directory);
    await walk(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return artifacts;
}

export async function compareTree(directory, expected) {
  const actual = await readTree(directory);
  const expectedByPath = new Map(expected.map((item) => [item.path, { content: Buffer.from(item.content), executable: item.executable === true }]));
  const actualByPath = new Map(actual.map((item) => [item.path, item]));
  const problems = [];
  for (const [relative, expectedFile] of expectedByPath) {
    if (!actualByPath.has(relative)) problems.push(`missing ${path.join(directory, relative)}`);
    else if (!actualByPath.get(relative).content.equals(expectedFile.content)) problems.push(`stale ${path.join(directory, relative)}`);
    else if (process.platform !== "win32" && actualByPath.get(relative).executable !== expectedFile.executable) problems.push(`stale executable mode ${path.join(directory, relative)}`);
  }
  for (const relative of actualByPath.keys()) if (!expectedByPath.has(relative)) problems.push(`unexpected ${path.join(directory, relative)}`);
  return problems;
}
