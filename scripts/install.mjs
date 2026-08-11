#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { renderHost, resolveHost } from "./lib/hosts.mjs";
import { assert, classifyCodexComponents, discoverMarketplace, inspectPlugin, json, ROOT, within } from "./lib/marketplace.mjs";
import { assertCatalogMatchesSchemas } from "./lib/schema.mjs";

export const USAGE = `Usage:
  node scripts/install.mjs <install|update|uninstall> --plugin <id> --host <host> --scope <project|user> [options]

Options:
  --variant <stable>               OpenCode only (default: stable)
  --mode <standalone|companion>    Required for Codex only
  --project <path>                 Project root (default: current directory)
  --dry-run                        Preflight and print actions without writing
  --force                          Replace conflicting unowned files; never modified owned files
  --help                           Show this help

Direct install hosts: codex, opencode, antigravity, portable-agent-skills.
Claude Code and Gemini CLI extension bundles must be installed with their native CLIs.`;

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const operation = argv.shift();
  if (!["install", "update", "uninstall"].includes(operation)) throw new Error("first argument must be install, update, or uninstall");
  const values = {};
  const flags = new Set();
  while (argv.length) {
    const token = argv.shift();
    if (["--dry-run", "--force"].includes(token)) {
      if (flags.has(token)) throw new Error(`${token} may only be specified once`);
      flags.add(token);
    } else if (["--plugin", "--host", "--scope", "--variant", "--mode", "--project"].includes(token)) {
      if (values[token]) throw new Error(`${token} may only be specified once`);
      const value = argv.shift();
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      values[token] = value;
    } else throw new Error(`unknown argument: ${token}`);
  }
  for (const required of ["--plugin", "--host", "--scope"]) if (!values[required]) throw new Error(`${required} is required`);
  if (!values["--plugin"].match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) throw new Error("--plugin must be a lowercase kebab-case id");
  if (!values["--host"].match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) throw new Error("--host must be a lowercase kebab-case id");
  if (!["project", "user"].includes(values["--scope"])) throw new Error("--scope must be project or user");
  const host = resolveHost(values["--host"], values["--variant"]);
  if (values["--host"] === "codex") {
    if (!["standalone", "companion"].includes(values["--mode"])) throw new Error("Codex requires --mode standalone or --mode companion");
  } else if (values["--mode"]) throw new Error("--mode is only valid for Codex");
  if (values["--project"] && values["--scope"] !== "project") throw new Error("--project is only valid with --scope project");
  if (operation === "uninstall" && flags.has("--force")) throw new Error("--force cannot bypass ownership checks during uninstall");
  return {
    operation,
    plugin: values["--plugin"],
    host: host.id,
    variant: host.variant,
    scope: values["--scope"],
    mode: values["--mode"] ?? null,
    project: values["--project"],
    dryRun: flags.has("--dry-run"),
    force: flags.has("--force")
  };
}

function homeDirectory(env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  assert(home, "a home directory is required for user installs");
  return path.resolve(home);
}

function identity(args) {
  return { plugin: args.plugin, host: args.host, variant: args.variant, scope: args.scope, mode: args.mode };
}

function sameIdentity(entry, expected) {
  return entry.plugin === expected.plugin && entry.host === expected.host && (entry.variant ?? null) === (expected.variant ?? null) && entry.scope === expected.scope && (entry.mode ?? null) === (expected.mode ?? null);
}

function ownershipKey(file) {
  const normalized = path.resolve(file);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function portableDestinationKey(file) {
  return path.resolve(file).normalize("NFC").toLowerCase();
}

function mapArtifacts(artifacts, predicate, destination) {
  return artifacts.filter((artifact) => predicate(artifact.path)).map((artifact) => ({ ...artifact, destination: destination(artifact.path) }));
}

function resolveOwnershipContext(args, env = process.env, cwd = process.cwd()) {
  const home = homeDirectory(env);
  const project = path.resolve(args.project ?? cwd);
  const scopeRoot = args.scope === "project" ? project : home;
  const stateBase = path.resolve(env.XDG_STATE_HOME || path.join(home, ".local", "state"), "oovz-plugins");
  const projectKey = createHash("sha256").update(project).digest("hex").slice(0, 24);
  const recordRoot = args.scope === "project" ? path.join(stateBase, "projects", projectKey) : path.join(stateBase, "user");
  const trustedRoots = new Set([recordRoot]);
  const prunableRoots = [];
  if (args.host === "codex") {
    trustedRoots.add(args.scope === "project" ? path.join(project, ".codex", "agents") : path.join(path.resolve(env.CODEX_HOME || path.join(home, ".codex")), "agents"));
    if (args.mode === "standalone") trustedRoots.add(args.scope === "project" ? path.join(project, ".agents", "skills") : path.join(home, ".agents", "skills"));
  } else if (args.host === "opencode") {
    trustedRoots.add(args.scope === "project" ? path.join(project, ".opencode") : path.resolve(env.OPENCODE_CONFIG_DIR || (env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, "opencode") : path.join(home, ".config", "opencode"))));
  } else if (args.host === "antigravity") {
    const pluginRoot = args.scope === "project" ? path.join(project, ".agents", "plugins", args.plugin) : path.join(home, ".gemini", "config", "plugins", args.plugin);
    trustedRoots.add(pluginRoot);
    prunableRoots.push(pluginRoot);
  } else if (args.host === "portable-agent-skills") {
    trustedRoots.add(path.join(scopeRoot, ".agents", "skills"));
  }
  return {
    home,
    project,
    scopeRoot,
    recordRoot,
    recordFile: path.join(recordRoot, "ownership.json"),
    trustedRoots: [...trustedRoots].map((root) => path.resolve(root)),
    prunableRoots: prunableRoots.map((root) => path.resolve(root)),
    identity: identity(args)
  };
}

export function resolveInstallPlan(plugin, args, env = process.env, cwd = process.cwd()) {
  const codexComponents = args.host === "codex" ? classifyCodexComponents(plugin.manifest.components) : null;
  if (args.host === "codex") {
    assert(plugin.manifest.hosts?.codex?.enabled === true, `${plugin.manifest.id} does not enable host codex`);
    assert(codexComponents.invalidDestinations.length === 0, `Codex host files must target declared skill support paths: ${codexComponents.invalidDestinations.map((file) => file.id).join(", ")}`);
    const hasStandaloneSkills = codexComponents.standaloneSkills.length > 0;
    const hasCompanionAgents = codexComponents.companionAgents.length > 0;
    const nativeCodexFiles = codexComponents.nativeFiles;
    if (args.mode === "companion" && !hasCompanionAgents) {
      if (nativeCodexFiles.length > 0) {
        throw new Error(`Codex companion mode cannot install "${plugin.manifest.displayName}": it declares native Codex host files (${nativeCodexFiles.map((file) => file.id).join(", ")}) but no companion agents. Install the native Codex plugin through its marketplace; there is no companion artifact to install.`);
      }
      if (hasStandaloneSkills) {
        throw new Error(`Codex companion mode is unavailable for the skill-only plugin "${plugin.manifest.displayName}". Install its skill through the native Codex marketplace, or use standalone mode when native plugin support is unavailable.`);
      }
      throw new Error(`Codex companion mode cannot install "${plugin.manifest.displayName}": it declares no companion agents or standalone skills.`);
    }
  }
  const rendered = renderHost(plugin, args.host, args.variant, { allowCompanion: args.host === "codex" && args.mode === "companion" });
  const context = resolveOwnershipContext(args, env, cwd);
  const { home, project, scopeRoot, recordRoot, recordFile } = context;
  const files = [];
  const trustedRoots = new Set(context.trustedRoots);
  const notices = [];

  if (args.host === "claude-code") {
    throw new Error(`Claude Code manages its plugin cache. Run "claude plugin marketplace add ${plugin.marketplace.repository}" then "claude plugin install ${plugin.manifest.id}@${plugin.marketplace.id}".`);
  }
  if (args.host === "gemini-cli") {
    throw new Error(`Gemini CLI manages extension installs. Build first, then run "gemini extensions install dist/gemini-cli/${plugin.manifest.id}".`);
  }

  if (args.host === "codex") {
    const agentRoot = args.scope === "project"
      ? path.join(project, ".codex", "agents")
      : path.join(path.resolve(env.CODEX_HOME || path.join(home, ".codex")), "agents");
    const skillRoot = args.scope === "project" ? path.join(project, ".agents", "skills") : path.join(home, ".agents", "skills");
    files.push(...mapArtifacts(rendered.artifacts, (relative) => relative.startsWith("companion/agents/"), (relative) => path.join(agentRoot, relative.slice("companion/agents/".length))));
    if (args.mode === "standalone") {
      const unsupported = codexComponents.nativeFiles;
      if (unsupported.length) {
        const alternative = codexComponents.companionAgents.length > 0
          ? "use the native plugin plus --mode companion"
          : "install the native Codex plugin through its marketplace";
        throw new Error(`Codex standalone cannot install native host files (${unsupported.map((file) => file.id).join(", ")}); ${alternative}`);
      }
      if (codexComponents.standaloneSkills.length === 0) {
        throw new Error(`Codex standalone cannot install "${plugin.manifest.displayName}": it declares no standalone skills; use companion mode for its custom agents.`);
      }
      files.push(...mapArtifacts(rendered.artifacts, (relative) => relative.startsWith("skills/"), (relative) => path.join(skillRoot, relative.slice("skills/".length))));
    } else if (codexComponents.nativeFiles.length > 0) {
      notices.push("Codex companion mode installs agent TOMLs only; native plugin host files must already be installed by the Codex plugin marketplace.");
    }
  } else if (args.host === "opencode") {
    const configRoot = args.scope === "project"
      ? project
      : path.resolve(env.OPENCODE_CONFIG_DIR || (env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, "opencode") : path.join(home, ".config", "opencode")));
    files.push(...mapArtifacts(rendered.artifacts, (relative) => relative.startsWith(".opencode/"), (relative) => args.scope === "project" ? path.join(project, relative) : path.join(configRoot, relative.slice(".opencode/".length))));
  } else if (args.host === "antigravity") {
    const bundleRoot = args.scope === "project" ? path.join(project, ".agents", "plugins", plugin.manifest.id) : path.join(home, ".gemini", "config", "plugins", plugin.manifest.id);
    files.push(...rendered.artifacts.map((artifact) => ({ ...artifact, destination: path.join(bundleRoot, artifact.path) })));
  } else if (args.host === "portable-agent-skills") {
    files.push(...mapArtifacts(rendered.artifacts, (relative) => relative.startsWith(".agents/"), (relative) => path.join(scopeRoot, relative)));
  } else throw new Error(`direct install is not supported for host ${args.host}`);

  const destinations = new Set();
  for (const file of files) {
    file.destination = path.resolve(file.destination);
    const key = portableDestinationKey(file.destination);
    assert(!destinations.has(key), `install plan contains duplicate destination ${file.destination}`);
    destinations.add(key);
    file.sha256 = createHash("sha256").update(file.content).digest("hex");
  }
  assert(files.length > 0, "install plan contains no files");
  return {
    files,
    recordFile,
    recordRoot,
    trustedRoots: [...trustedRoots].map((root) => path.resolve(root)),
    prunableRoots: context.prunableRoots,
    identity: identity(args),
    notices
  };
}

async function readRecord(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    assert(value?.schemaVersion === 1 && value.files && typeof value.files === "object" && !Array.isArray(value.files), `invalid ownership record ${file}`);
    const entries = Object.entries(value.files);
    assert(entries.length <= 10000, `ownership record has too many entries: ${file}`);
    const portablePaths = new Set();
    for (const [destination, entry] of entries) {
      assert(path.isAbsolute(destination) && path.normalize(destination) === destination, `ownership record contains a non-canonical absolute path: ${destination}`);
      const portable = portableDestinationKey(destination);
      assert(!portablePaths.has(portable), `ownership record contains a cross-platform path collision: ${destination}`);
      portablePaths.add(portable);
      assert(entry && typeof entry === "object" && typeof entry.plugin === "string" && typeof entry.version === "string" && typeof entry.host === "string", `ownership record contains invalid metadata for ${destination}`);
      assert(["project", "user"].includes(entry.scope) && (entry.variant === null || typeof entry.variant === "string") && (entry.mode === null || typeof entry.mode === "string"), `ownership record contains invalid scope/variant/mode for ${destination}`);
      assert(/^[a-f0-9]{64}$/.test(entry.sha256), `ownership record contains an invalid hash for ${destination}`);
    }
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, files: {} };
    throw error;
  }
}

async function existingAncestor(target) {
  let current = path.resolve(target);
  while (true) {
    try { await lstat(current); return current; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`no existing ancestor for ${target}`);
    current = parent;
  }
}

async function assertNoSymlinkPath(target, trustedRoot) {
  within(trustedRoot, target, "install destination");
  const ancestor = await existingAncestor(trustedRoot);
  const ancestorInfo = await lstat(ancestor);
  if (ancestorInfo.isSymbolicLink()) throw new Error(`refusing symlink in install path: ${ancestor}`);
  const relative = path.relative(ancestor, target);
  let current = ancestor;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`refusing symlink in install path: ${current}`);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
}

async function removeCreatedDirectories(created) {
  for (const directory of [...created].reverse()) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
}

async function acquireRecordLock(plan) {
  const createdDirectories = [];
  await assertNoSymlinkPath(plan.recordRoot, plan.recordRoot);
  await mkdirTracked(plan.recordRoot, createdDirectories);
  await assertNoSymlinkPath(plan.recordRoot, plan.recordRoot);
  const lockDirectory = path.join(plan.recordRoot, ".install.lock");
  await assertNoSymlinkPath(lockDirectory, plan.recordRoot);
  try {
    await mkdir(lockDirectory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") {
      await removeCreatedDirectories(createdDirectories);
      throw error;
    }
    const info = await lstat(lockDirectory);
    if (info.isSymbolicLink()) throw new Error(`refusing symlink in install path: ${lockDirectory}`);
    await removeCreatedDirectories(createdDirectories);
    throw new Error(`ownership record is busy; another install, update, or uninstall is in progress. Lock: ${lockDirectory}. If no installer process is running, remove that lock directory manually and retry.`);
  }
  const lockInfo = await lstat(lockDirectory);
  if (lockInfo.isSymbolicLink() || !lockInfo.isDirectory()) throw new Error(`invalid ownership lock: ${lockDirectory}`);
  return async () => {
    await assertNoSymlinkPath(lockDirectory, plan.recordRoot);
    const current = await lstat(lockDirectory);
    if (current.isSymbolicLink() || !current.isDirectory()) throw new Error(`invalid ownership lock: ${lockDirectory}`);
    await rmdir(lockDirectory);
    await removeCreatedDirectories(createdDirectories);
  };
}

function trustedRootFor(destination, roots) {
  const candidates = roots.filter((root) => {
    const relative = path.relative(root, destination);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  }).sort((a, b) => b.length - a.length);
  assert(candidates.length > 0, `destination is outside trusted roots: ${destination}`);
  return candidates[0];
}

async function fileHash(file) {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`owned destination is not a regular file: ${file}`);
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function mkdirTracked(directory, created) {
  const missing = [];
  let current = path.resolve(directory);
  while (true) {
    try { await lstat(current); break; } catch (error) { if (error.code !== "ENOENT") throw error; }
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  await mkdir(directory, { recursive: true });
  for (const item of missing.reverse()) if (!created.includes(item)) created.push(item);
}

async function preflight(args, plan, record) {
  await assertNoSymlinkPath(plan.recordFile, plan.recordRoot);
  const owned = Object.entries(record.files).filter(([, entry]) => sameIdentity(entry, plan.identity));
  if (args.operation === "install" && owned.length) throw new Error("this plugin/host/scope is already installed; use update");
  if (args.operation !== "install" && owned.length === 0) throw new Error("no matching owned installation was found");
  for (const [destination, entry] of owned) {
    const root = trustedRootFor(destination, plan.trustedRoots);
    await assertNoSymlinkPath(destination, root);
    const actual = await fileHash(destination);
    if (actual !== null && actual !== entry.sha256) throw new Error(`owned file was modified; refusing to overwrite or remove: ${destination}`);
  }

  const writes = args.operation === "uninstall" ? [] : plan.files;
  const planned = new Set(writes.map((file) => ownershipKey(file.destination)));
  for (const file of writes) {
    const root = trustedRootFor(file.destination, plan.trustedRoots);
    await assertNoSymlinkPath(file.destination, root);
    const owner = record.files[ownershipKey(file.destination)];
    if (owner && !sameIdentity(owner, plan.identity)) throw new Error(`destination is owned by another plugin or install mode: ${file.destination}`);
    const current = await fileHash(file.destination);
    if (!owner && current !== null && !args.force) throw new Error(`destination already exists and is unowned (use --force to replace): ${file.destination}`);
  }
  const removals = owned.map(([destination]) => destination).filter((destination) => !planned.has(ownershipKey(destination)));
  return { writes, removals, owned };
}

async function commit(plan, record, actions) {
  const token = `${process.pid}-${randomUUID()}`;
  const changed = [];
  const staged = [];
  const createdDirectories = [];
  let recordBackup = null;
  let recordInstalled = false;
  const newRecord = structuredClone(record);
  for (const [destination] of actions.owned) delete newRecord.files[destination];
  for (const file of actions.writes) {
    newRecord.files[ownershipKey(file.destination)] = { ...plan.identity, version: file.version, sha256: file.sha256 };
  }
  for (const file of actions.writes) newRecord.files[ownershipKey(file.destination)].version ??= plan.version;

  try {
    for (const file of actions.writes) {
      await mkdirTracked(path.dirname(file.destination), createdDirectories);
      const temporary = `${file.destination}.oovz-tmp-${token}`;
      await writeFile(temporary, file.content, { mode: file.executable ? 0o755 : 0o644, flag: "wx" });
      staged.push(temporary);
    }
    for (const destination of [...new Set([...actions.removals, ...actions.writes.map((file) => file.destination)])]) {
      const backup = `${destination}.oovz-backup-${token}`;
      try { await rename(destination, backup); changed.push({ destination, backup }); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    for (const file of actions.writes) {
      const temporary = `${file.destination}.oovz-tmp-${token}`;
      await rename(temporary, file.destination);
      changed.push({ destination: file.destination, created: true });
    }
    await mkdirTracked(plan.recordRoot, createdDirectories);
    const recordTemporary = `${plan.recordFile}.tmp-${token}`;
    await writeFile(recordTemporary, json(newRecord), { flag: "wx" });
    staged.push(recordTemporary);
    try { recordBackup = `${plan.recordFile}.backup-${token}`; await rename(plan.recordFile, recordBackup); } catch (error) { if (error.code !== "ENOENT") throw error; recordBackup = null; }
    await rename(recordTemporary, plan.recordFile);
    recordInstalled = true;
    if (recordBackup) await rm(recordBackup, { force: true }).catch(() => {});
    for (const item of changed) if (item.backup) await rm(item.backup, { force: true }).catch(() => {});
  } catch (error) {
    if (recordInstalled) await rm(plan.recordFile, { force: true }).catch(() => {});
    if (recordBackup) await rename(recordBackup, plan.recordFile).catch(() => {});
    for (const item of [...changed].reverse()) {
      if (item.created) await rm(item.destination, { force: true }).catch(() => {});
      if (item.backup) await rename(item.backup, item.destination).catch(() => {});
    }
    for (const file of staged) await rm(file, { force: true }).catch(() => {});
    for (const directory of [...createdDirectories].reverse()) await rmdir(directory).catch(() => {});
    throw error;
  }
}

async function pruneEmptyOwnedDirectories(plan, removals) {
  const candidates = new Map();
  for (const destination of removals) {
    const root = trustedRootFor(destination, plan.trustedRoots);
    let current = path.dirname(destination);
    while (ownershipKey(current) !== ownershipKey(root)) {
      within(root, current, "owned directory");
      candidates.set(portableDestinationKey(current), { directory: current, root });
      current = path.dirname(current);
    }
  }
  const ordered = [...candidates.values()].sort((a, b) => b.directory.length - a.directory.length || b.directory.localeCompare(a.directory));
  for (const { directory, root } of ordered) {
    await assertNoSymlinkPath(directory, root);
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`refusing to prune a non-directory install path: ${directory}`);
      await rmdir(directory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
  for (const directory of plan.prunableRoots ?? []) {
    const boundary = path.dirname(directory);
    await assertNoSymlinkPath(directory, boundary);
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`refusing to prune a non-directory install path: ${directory}`);
      await rmdir(directory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
}

export async function runInstaller(argv, options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const env = options.env ?? process.env;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const stdout = options.stdout ?? process.stdout;
  const args = parseArgs([...argv]);
  if (args.help) { stdout.write(`${USAGE}\n`); return; }
  let plan;
  if (args.operation === "uninstall") {
    const context = resolveOwnershipContext(args, env, cwd);
    plan = { ...context, files: [], notices: [], version: null };
  } else {
    const catalog = await discoverMarketplace(root);
    await assertCatalogMatchesSchemas(catalog);
    const found = catalog.plugins.find((plugin) => plugin.manifest.id === args.plugin);
    if (!found) throw new Error(`unknown plugin: ${args.plugin}`);
    const plugin = await inspectPlugin(found);
    plan = resolveInstallPlan(plugin, args, env, cwd);
    plan.version = plugin.manifest.version;
    for (const file of plan.files) file.version = plugin.manifest.version;
  }
  const releaseLock = await acquireRecordLock(plan);
  try {
    await assertNoSymlinkPath(plan.recordFile, plan.recordRoot);
    const record = await readRecord(plan.recordFile);
    const actions = await preflight(args, plan, record);
    for (const notice of plan.notices) stdout.write(`note: ${notice}\n`);
    const verb = args.operation === "uninstall" ? "remove" : "write";
    for (const file of args.operation === "uninstall" ? actions.removals : actions.writes.map(({ destination }) => destination)) stdout.write(`${args.dryRun ? "would " : ""}${verb} ${file}\n`);
    if (!args.dryRun) {
      await commit(plan, record, actions);
      await pruneEmptyOwnedDirectories(plan, actions.removals);
    }
  } finally {
    await releaseLock();
  }
  stdout.write(`${args.dryRun ? "dry-run complete" : `${args.operation} complete`}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runInstaller(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
