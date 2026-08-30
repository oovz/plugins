import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.mjs";

export function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function pathInfo(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function nearestExisting(target) {
  let current = path.resolve(target);
  while (true) {
    const info = await pathInfo(current);
    if (info) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new CliError(`No existing ancestor for ${target}`, 1);
    current = parent;
  }
}

export async function assertSafePath(root, file) {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(file);
  if (!isContained(resolvedRoot, resolvedFile)) throw new CliError(`Managed path escapes its trusted root: ${file}`, 1);
  const start = await nearestExisting(resolvedRoot);
  let current = start;
  const relative = path.relative(start, resolvedFile);
  for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    const info = await pathInfo(current);
    if (info?.isSymbolicLink()) throw new CliError(`Refusing a symlink or junction in the managed path: ${current}`, 1);
  }
}

export async function hashFile(file) {
  const info = await pathInfo(file);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) throw new CliError(`Managed destination is not a regular file: ${file}`, 1);
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function removeEmptyParents(file, boundary) {
  let current = path.dirname(file);
  const root = path.resolve(boundary);
  while (isContained(root, current) && path.resolve(current) !== root) {
    try {
      await rmdir(current);
    } catch (error) {
      if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) break;
      throw error;
    }
    current = path.dirname(current);
  }
}

export async function commitManagedOperation(operation, plan) {
  const token = `${process.pid}-${randomUUID()}`;
  const staged = [];
  const backups = [];
  const created = [];
  let stateBackup = null;
  let stateWritten = false;
  try {
    for (const file of plan.writes) {
      await mkdir(path.dirname(file.destination), { recursive: true });
      const temporary = `${file.destination}.sew-tmp-${token}`;
      await writeFile(temporary, file.content, { flag: "wx", mode: 0o600 });
      staged.push({ temporary, destination: file.destination });
    }
    const destinations = [...new Set([
      ...plan.removals.map((item) => item.destination),
      ...plan.writes.map((item) => item.destination),
    ])];
    for (const destination of destinations) {
      const backup = `${destination}.sew-backup-${token}`;
      try {
        await rename(destination, backup);
        backups.push({ destination, backup });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (const item of staged) {
      await rename(item.temporary, item.destination);
      created.push(item.destination);
    }
    if (plan.nextState) {
      await mkdir(path.dirname(plan.statePath), { recursive: true });
      const stateTemp = `${plan.statePath}.tmp-${token}`;
      await writeFile(stateTemp, `${JSON.stringify(plan.nextState, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      try {
        stateBackup = `${plan.statePath}.backup-${token}`;
        await rename(plan.statePath, stateBackup);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        stateBackup = null;
      }
      await rename(stateTemp, plan.statePath);
      stateWritten = true;
    } else {
      try {
        stateBackup = `${plan.statePath}.backup-${token}`;
        await rename(plan.statePath, stateBackup);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        stateBackup = null;
      }
    }
    if (stateBackup) await rm(stateBackup, { force: true });
    for (const item of backups) await rm(item.backup, { force: true });
  } catch (error) {
    if (stateWritten) await rm(plan.statePath, { force: true }).catch(() => {});
    if (stateBackup) await rename(stateBackup, plan.statePath).catch(() => {});
    for (const destination of created.reverse()) await rm(destination, { force: true }).catch(() => {});
    for (const item of backups.reverse()) await rename(item.backup, item.destination).catch(() => {});
    for (const item of staged) await rm(item.temporary, { force: true }).catch(() => {});
    throw error;
  }
  for (const item of plan.removals) await removeEmptyParents(item.destination, item.rootPath).catch(() => {});
  if (operation === "uninstall") await removeEmptyParents(plan.statePath, path.dirname(path.dirname(plan.statePath))).catch(() => {});
}
