import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
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

function anchorPath(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.path === "string") return value.path;
    if (typeof value.anchor === "string") return value.anchor;
  }
  return value;
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function nearestExisting(file) {
  let current = path.resolve(file);
  while (true) {
    const info = await pathInfo(current);
    if (info) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new CliError(`Managed path has no existing anchor: ${file}`, 1);
    current = parent;
  }
}

export async function assertSafePath(root, file, anchor = path.parse(path.resolve(root)).root) {
  const requestedAnchor = path.resolve(anchorPath(anchor));
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(file);
  if (!isContained(requestedAnchor, resolvedRoot)) throw new CliError(`Managed root escapes its trusted anchor: ${root}`, 1);
  if (!isContained(resolvedRoot, resolvedFile)) throw new CliError(`Managed path escapes its trusted root: ${file}`, 1);
  const existingAnchor = await nearestExisting(requestedAnchor);
  const anchorInfo = await pathInfo(existingAnchor);
  if (anchorInfo.isSymbolicLink()) throw new CliError(`Refusing a symlink or junction in the managed path anchor: ${existingAnchor}`, 1);
  const currentAnchorReal = await realpath(existingAnchor);
  if (anchor && typeof anchor === "object" && anchor.realPath) {
    const baselineExisting = path.resolve(anchor.existingPath ?? requestedAnchor);
    const baselineInfo = await pathInfo(baselineExisting);
    if (!baselineInfo || baselineInfo.isSymbolicLink()) throw new CliError(`Trusted managed path anchor changed: ${requestedAnchor}`, 1);
    const baselineReal = await realpath(baselineExisting);
    if (!samePath(baselineReal, anchor.realPath)) throw new CliError(`Trusted managed path anchor changed: ${requestedAnchor}`, 1);
    const anchorExistedAtCapture = !anchor.existingPath || samePath(anchor.existingPath, requestedAnchor);
    if (anchorExistedAtCapture && samePath(existingAnchor, requestedAnchor) && !samePath(currentAnchorReal, anchor.realPath)) {
      throw new CliError(`Trusted managed path anchor changed: ${requestedAnchor}`, 1);
    }
  }
  const anchorReal = anchor?.realPath ? path.resolve(anchor.realPath) : currentAnchorReal;
  const traversalStart = anchor && typeof anchor === "object" && anchor.existingPath
    ? path.resolve(anchor.existingPath)
    : existingAnchor;
  let current = traversalStart;
  for (const part of path.relative(traversalStart, resolvedFile).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await pathInfo(current);
    if (!info) break;
    if (info.isSymbolicLink()) throw new CliError(`Refusing a symlink or junction in the managed path: ${current}`, 1);
  }
  const rootInfo = await pathInfo(resolvedRoot);
  if (rootInfo) {
    const rootReal = await realpath(resolvedRoot);
    if (!isContained(anchorReal, rootReal)) throw new CliError(`Managed root resolves outside its trusted anchor: ${resolvedRoot}`, 1);
  }
  const fileInfo = await pathInfo(resolvedFile);
  if (fileInfo) {
    const fileReal = await realpath(resolvedFile);
    if (!isContained(anchorReal, fileReal)) throw new CliError(`Managed path resolves outside its trusted anchor: ${resolvedFile}`, 1);
  }
}

export async function capturePathAnchor(anchor) {
  const requestedAnchor = path.resolve(anchorPath(anchor));
  const existingAnchor = await nearestExisting(requestedAnchor);
  const info = await pathInfo(existingAnchor);
  if (info.isSymbolicLink()) throw new CliError(`Refusing a symlink or junction in the managed path anchor: ${existingAnchor}`, 1);
  return Object.freeze({ path: requestedAnchor, existingPath: existingAnchor, realPath: await realpath(existingAnchor) });
}

export async function hashFile(file) {
  const info = await pathInfo(file);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) throw new CliError(`Managed destination is not a regular file: ${file}`, 1);
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function acquireManagedLock(statePath, options = {}) {
  const stateDirectory = path.dirname(path.resolve(statePath));
  const lockDirectory = path.join(stateDirectory, ".install.lock");
  const anchor = options.anchor;
  await assertSafePath(stateDirectory, stateDirectory, anchor);
  const createdDirectories = await mkdirTracked(stateDirectory);
  try {
    await assertSafePath(stateDirectory, lockDirectory, anchor);
  } catch (error) {
    await removeTrackedDirectories(createdDirectories);
    throw error;
  }
  try {
    await mkdir(lockDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      const info = await pathInfo(lockDirectory);
      if (info?.isSymbolicLink()) {
        await removeTrackedDirectories(createdDirectories);
        throw new CliError(`Refusing a symlink or junction in the managed lock path: ${lockDirectory}`, 1);
      }
      await removeTrackedDirectories(createdDirectories);
      throw new CliError(`Managed installation is busy; another install, update, uninstall, or model configuration is in progress. Lock: ${lockDirectory}. If no installer process is running, remove that lock directory manually and retry.`, 1);
    }
    await removeTrackedDirectories(createdDirectories);
    throw error;
  }
  const info = await pathInfo(lockDirectory);
  if (!info || info.isSymbolicLink() || !info.isDirectory()) {
    await removeTrackedDirectories(createdDirectories);
    throw new CliError(`Invalid managed installation lock: ${lockDirectory}`, 1);
  }
  return async () => {
    await assertSafePath(stateDirectory, lockDirectory, anchor);
    const current = await pathInfo(lockDirectory);
    if (!current) {
      await removeTrackedDirectories(createdDirectories);
      return;
    }
    if (current.isSymbolicLink() || !current.isDirectory()) throw new CliError(`Invalid managed installation lock: ${lockDirectory}`, 1);
    await rmdir(lockDirectory);
    await removeTrackedDirectories(createdDirectories);
  };
}

export async function withManagedLock(statePath, callback, options = {}) {
  const release = await acquireManagedLock(statePath, options);
  try {
    return await callback();
  } finally {
    await release();
  }
}

async function removeEmptyParents(file, boundary, anchor) {
  let current = path.dirname(file);
  const root = path.resolve(boundary);
  while (isContained(root, current) && path.resolve(current) !== root) {
    await assertSafePath(root, current, anchor);
    try {
      await rmdir(current);
    } catch (error) {
      if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) break;
      throw error;
    }
    current = path.dirname(current);
  }
}

async function mkdirTracked(directory) {
  const missing = [];
  let current = path.resolve(directory);
  while (true) {
    const info = await pathInfo(current);
    if (info) break;
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  await mkdir(directory, { recursive: true });
  return missing.reverse();
}

async function removeTrackedDirectories(directories) {
  for (const directory of [...directories].reverse()) {
    try { await rmdir(directory); }
    catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
    }
  }
}

function planRootFor(item, plan) {
  if (item.rootPath) return item.rootPath;
  if (typeof item.root === "string" && path.isAbsolute(item.root)) return item.root;
  if (item.root && plan.roots?.[item.root]) return plan.roots[item.root];
  const destination = path.resolve(item.destination);
  return Object.values(plan.roots ?? {}).find((root) => isContained(root, destination));
}

function planRootOrFilesystem(item, plan) {
  const root = planRootFor(item, plan);
  if (root) return root;
  if (plan.requireRoots) throw new CliError(`Managed operation has no trusted root for ${item.destination}.`, 1);
  return path.parse(path.resolve(item.destination)).root;
}

function planAnchorFor(root, plan) {
  if (!root) return plan.anchor;
  return plan.rootAnchors?.[root] ?? plan.anchor;
}

async function validatePlanPaths(plan) {
  if (plan.statePath) await assertSafePath(path.dirname(plan.statePath), plan.statePath, plan.stateAnchor ?? plan.anchor);
  for (const item of [...(plan.writes ?? []), ...(plan.removals ?? [])]) {
    const root = planRootFor(item, plan);
    if (!root) {
      if (plan.requireRoots) throw new CliError(`Managed operation has no trusted root for ${item.destination}.`, 1);
      continue;
    }
    await assertSafePath(root, item.destination, planAnchorFor(root, plan));
  }
}

async function retainManagedPlanAnchors(plan) {
  const stateAnchor = plan.stateAnchor && typeof plan.stateAnchor === "object" && plan.stateAnchor.realPath
    ? plan.stateAnchor
    : plan.stateAnchor ? await capturePathAnchor(plan.stateAnchor) : undefined;
  const rootAnchors = Object.fromEntries(await Promise.all(Object.entries(plan.rootAnchors ?? {}).map(async ([root, anchor]) => [
    root,
    anchor && typeof anchor === "object" && anchor.realPath ? anchor : await capturePathAnchor(anchor),
  ])));
  return { ...plan, ...(stateAnchor ? { stateAnchor } : {}), rootAnchors };
}

async function commitManagedOperationLocked(operation, plan) {
  const token = `${process.pid}-${randomUUID()}`;
  const io = { mkdir, rename, rm, writeFile, ...(plan.io ?? {}) };
  const staged = [];
  const backups = [];
  const created = [];
  let stateBackup = null;
  let stateWritten = false;
  try {
    await validatePlanPaths(plan);
    for (const file of plan.writes) {
      const root = planRootOrFilesystem(file, plan);
      if (root) await assertSafePath(root, file.destination, planAnchorFor(root, plan));
      await io.mkdir(path.dirname(file.destination), { recursive: true });
      if (root) await assertSafePath(root, file.destination, planAnchorFor(root, plan));
      const temporary = `${file.destination}.sew-tmp-${token}`;
      staged.push({ temporary, destination: file.destination, rootPath: root, root, anchor: root ? planAnchorFor(root, plan) : undefined });
      if (root) await assertSafePath(root, temporary, planAnchorFor(root, plan));
      await io.writeFile(temporary, file.content, { flag: "wx", mode: file.mode ?? 0o600 });
    }
    const destinations = [...new Set([
      ...plan.removals.map((item) => item.destination),
      ...plan.writes.map((item) => item.destination),
    ])];
    for (const destination of destinations) {
      const item = [...plan.removals, ...plan.writes].find((candidate) => candidate.destination === destination);
      const root = item ? planRootOrFilesystem(item, plan) : undefined;
      if (root) await assertSafePath(root, destination, planAnchorFor(root, plan));
      const backup = `${destination}.sew-backup-${token}`;
      if (root) await assertSafePath(root, backup, planAnchorFor(root, plan));
      try {
        await io.rename(destination, backup);
        backups.push({ destination, backup, rootPath: root, root, anchor: root ? planAnchorFor(root, plan) : undefined });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (const item of staged) {
      const root = planRootOrFilesystem(item, plan);
      if (root) await assertSafePath(root, item.destination, planAnchorFor(root, plan));
      if (root) await assertSafePath(root, item.temporary, planAnchorFor(root, plan));
      await io.rename(item.temporary, item.destination);
      created.push({ destination: item.destination, rootPath: root, root, anchor: root ? planAnchorFor(root, plan) : undefined });
    }
    if (plan.nextState) {
      await assertSafePath(path.dirname(plan.statePath), plan.statePath, plan.stateAnchor ?? plan.anchor);
      await io.mkdir(path.dirname(plan.statePath), { recursive: true });
      const stateTemp = `${plan.statePath}.tmp-${token}`;
      staged.push({ temporary: stateTemp, destination: plan.statePath, rootPath: path.dirname(plan.statePath), root: path.dirname(plan.statePath), anchor: plan.stateAnchor ?? plan.anchor });
      await assertSafePath(path.dirname(plan.statePath), stateTemp, plan.stateAnchor ?? plan.anchor);
      await io.writeFile(stateTemp, `${JSON.stringify(plan.nextState, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      try {
        stateBackup = `${plan.statePath}.backup-${token}`;
        await assertSafePath(path.dirname(plan.statePath), stateBackup, plan.stateAnchor ?? plan.anchor);
        await io.rename(plan.statePath, stateBackup);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        stateBackup = null;
      }
      await assertSafePath(path.dirname(plan.statePath), plan.statePath, plan.stateAnchor ?? plan.anchor);
      await io.rename(stateTemp, plan.statePath);
      stateWritten = true;
    } else {
      await assertSafePath(path.dirname(plan.statePath), plan.statePath, plan.stateAnchor ?? plan.anchor);
      try {
        stateBackup = `${plan.statePath}.backup-${token}`;
        await assertSafePath(path.dirname(plan.statePath), stateBackup, plan.stateAnchor ?? plan.anchor);
        await io.rename(plan.statePath, stateBackup);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        stateBackup = null;
      }
    }
  } catch (error) {
    const rollbackFailures = [];
    const rollback = async (operationName, target, action) => {
      try { await action(); } catch (rollbackError) { rollbackFailures.push(`${operationName} ${target}: ${rollbackError.message}`); }
    };
    const safeRollbackPath = async (root, target, anchor) => assertSafePath(root, target, anchor);
    const stateRoot = path.dirname(plan.statePath);
    const stateAnchor = plan.stateAnchor ?? plan.anchor;
    if (stateWritten) await rollback("remove committed state", plan.statePath, async () => {
      await safeRollbackPath(stateRoot, plan.statePath, stateAnchor);
      await io.rm(plan.statePath, { force: true });
    });
    if (stateBackup) await rollback("restore state", plan.statePath, async () => {
      await safeRollbackPath(stateRoot, stateBackup, stateAnchor);
      await safeRollbackPath(stateRoot, plan.statePath, stateAnchor);
      await io.rename(stateBackup, plan.statePath);
    });
    for (const item of created.reverse()) await rollback("remove replacement", item.destination, async () => {
      await safeRollbackPath(item.root, item.destination, item.anchor);
      await io.rm(item.destination, { force: true });
    });
    for (const item of backups.reverse()) await rollback("restore backup", item.destination, async () => {
      await safeRollbackPath(item.root, item.backup, item.anchor);
      await safeRollbackPath(item.root, item.destination, item.anchor);
      await io.rename(item.backup, item.destination);
    });
    for (const item of staged) await rollback("remove temporary", item.temporary, async () => {
      await safeRollbackPath(item.root ?? stateRoot, item.temporary, item.anchor ?? stateAnchor);
      await io.rm(item.temporary, { force: true });
    });
    if (rollbackFailures.length > 0) {
      const recoveryPaths = [stateBackup, ...backups.map((item) => item.backup), ...staged.map((item) => item.temporary)].filter(Boolean);
      throw new CliError(`${error.message}; rollback incomplete: ${rollbackFailures.join("; ")}${recoveryPaths.length > 0 ? `; inspect retained recovery material at ${recoveryPaths.join(", ")}` : ""}`, error instanceof CliError ? error.exitCode : 1);
    }
    throw error;
  }
  const cleanupFailures = [];
  const cleanup = async (operationName, target, action) => {
    try { await action(); } catch (cleanupError) {
      cleanupFailures.push({ operation: operationName, path: target, message: cleanupError.message, code: cleanupError.code });
    }
  };
  const stateRoot = path.dirname(plan.statePath);
  const stateAnchor = plan.stateAnchor ?? plan.anchor;
  if (stateBackup) await cleanup("remove state backup", stateBackup, async () => {
    await assertSafePath(stateRoot, stateBackup, stateAnchor);
    await io.rm(stateBackup, { force: true });
  });
  for (const item of backups) await cleanup("remove file backup", item.backup, async () => {
    await assertSafePath(item.root, item.backup, item.anchor);
    await io.rm(item.backup, { force: true });
  });
  for (const item of plan.removals) await removeEmptyParents(item.destination, item.rootPath, planAnchorFor(item.rootPath, plan)).catch(() => {});
  if (operation === "uninstall") await removeEmptyParents(plan.statePath, path.dirname(path.dirname(plan.statePath)), stateAnchor).catch(() => {});
  return { cleanupFailures };
}

export async function commitManagedOperation(operation, plan, options = {}) {
  const retainedPlan = await retainManagedPlanAnchors(plan);
  if (options.lockHeld === true) return commitManagedOperationLocked(operation, retainedPlan);
  return withManagedLock(retainedPlan.statePath, () => commitManagedOperationLocked(operation, retainedPlan), {
    anchor: retainedPlan.stateAnchor ?? retainedPlan.anchor,
  });
}
