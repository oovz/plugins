import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { CliError } from "./errors.mjs";
import { assertSafePath, commitManagedOperation, hashFile, isContained, pathInfo } from "./managed-files.mjs";
import {
  MODEL_EDIT_HOSTS,
  MODEL_MARKER,
  PRESETS,
  ROLES,
  applyModelOverlay,
  isManagedModelContent,
  modelExtension,
  normalizePreset,
  parseRoleMap,
  slotConfiguration,
  validateModelConfiguration,
  validateScalar,
  validateStoredModels,
} from "./model-config.mjs";
import { defaultSpawnSync, spawnHost } from "./process.mjs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_NAME = "@oovz/sew";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_MANIFEST = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
const PACKAGE_VERSION = PACKAGE_MANIFEST.version;
const PAYLOAD_ROOT = path.join(PACKAGE_ROOT, "payloads");
const PLUGIN_ID = "senior-engineering-workflow";
const MARKETPLACE_ID = "otto-plugins";
const MARKETPLACE_SOURCE = "oovz/plugins";
const CODEX_PLUGIN_ID = `${PLUGIN_ID}@${MARKETPLACE_ID}`;
const INSTALL_STATE_SCHEMA = 2;

const HOSTS = Object.freeze(["claude-code", "codex", "opencode", "gemini-cli", "antigravity", "oh-my-pi"]);
const NATIVE_INSTALL_HOSTS = new Set(["claude-code", "oh-my-pi"]);
const STATIC_INSTALL_HOSTS = new Set(HOSTS.filter((host) => !NATIVE_INSTALL_HOSTS.has(host)));

const COMMAND_OPTIONS = Object.freeze({
  install: Object.freeze({ values: new Set(["host", "scope", "project"]), booleans: new Set(["dry-run", "force", "json", "help"]) }),
  update: Object.freeze({ values: new Set(["host", "scope", "project"]), booleans: new Set(["dry-run", "force", "json", "help"]) }),
  uninstall: Object.freeze({ values: new Set(["host", "scope", "project"]), booleans: new Set(["dry-run", "force", "json", "help"]) }),
  "models-configure": Object.freeze({
    values: new Set(["host", "scope", "project", "preset", "worker-model", "worker-thinking", "balanced-model", "balanced-thinking", "map"]),
    booleans: new Set(["dry-run", "force", "json", "help"]),
  }),
  doctor: Object.freeze({ values: new Set(["host", "project"]), booleans: new Set(["json", "help"]) }),
});

function usage() {
  return `${PACKAGE_NAME} ${PACKAGE_VERSION}

Install and configure Senior Engineering Workflow.

Usage:
  sew install --host <host> [--scope <user|project>] [options]
  sew update --host <host> [--scope <user|project>] [options]
  sew uninstall --host <host> [--scope <user|project>] [options]
  sew models configure --host <host> --preset <inherit|two-model|three-model> [options]
  sew doctor [--host <all|comma-list>] [options]

Hosts:
  ${HOSTS.join(", ")}

Install/update/uninstall options:
  --scope <user|project>          Target scope (default: user)
  --project <path>               Project root (default: current directory)
  --dry-run                      Show the operation without changing files or invoking a host CLI
  --force                        Replace conflicts; for Codex, reinstall the marketplace skill and companion agents
  --json                         Emit JSON

Model options:
  --worker-model <id>            Model for the worker slot
  --worker-thinking <value>      Host-native effort/variant/thinking value
  --balanced-model <id>          Model for the balanced slot
  --balanced-thinking <value>    Host-native effort/variant/thinking value
  --map <role=slot,...>          Slots: inherit, balanced, worker
  --dry-run                      Show changes without writing
  --force                        Edit installed agents even when modified outside the package
  --json                         Emit JSON

Doctor options:
  --host <all|comma-list>        Inspect all six hosts by default
  --project <path>               Project root (default: current directory)
  --json                         Emit JSON

Notes:
  Canonical plugin agents inherit the host session's model, thinking level, tools, and permissions.
  models configure edits installed role agents in place on codex, opencode, and gemini-cli; other hosts are unsupported.
  models configure --preset inherit restores the CI payload by removing the model/thinking fields.
  doctor is read-only and never calls a model API.
`;
}

function parseArgs(argv) {
  const args = [...argv];
  const first = args[0];
  if (first === "--help" || first === "-h") return { command: "help", options: {} };
  if (first === "--version" || first === "-v") return { command: "version", options: {} };

  let command = args.shift() ?? "help";
  if (command === "models") {
    const subcommand = args.shift();
    if (subcommand !== "configure") throw new CliError("models requires the configure subcommand.\n\n" + usage());
    command = "models-configure";
  }
  const definition = COMMAND_OPTIONS[command];
  if (!definition) throw new CliError(`Unknown command: ${command}\n\n${usage()}`);

  const options = {};
  while (args.length > 0) {
    const token = args.shift();
    if (!token?.startsWith("--")) throw new CliError(`Unexpected positional argument: ${token}`);
    const raw = token.slice(2);
    const equal = raw.indexOf("=");
    const key = equal >= 0 ? raw.slice(0, equal) : raw;
    if (!key) throw new CliError("Empty option name.");
    if (Object.hasOwn(options, key)) throw new CliError(`Option --${key} may be provided only once.`);
    if (!definition.values.has(key) && !definition.booleans.has(key)) throw new CliError(`Unknown option for ${command.replace("-", " ")}: --${key}`);
    if (definition.booleans.has(key)) {
      if (equal >= 0) throw new CliError(`Boolean option --${key} does not accept a value.`);
      options[key] = true;
      continue;
    }
    const value = equal >= 0 ? raw.slice(equal + 1) : args.shift();
    if (value === undefined || value.startsWith("--")) throw new CliError(`Option --${key} requires a value.`);
    if (!value.trim()) throw new CliError(`Option --${key} must not be empty.`);
    options[key] = value;
  }
  return { command, options };
}

function normalizeHost(value) {
  if (!HOSTS.includes(value)) throw new CliError(`--host must be one of: ${HOSTS.join(", ")}`);
  return value;
}

function normalizeDoctorHosts(value = "all") {
  const requested = value === "all" ? HOSTS : value.split(",").map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0) throw new CliError("--host must name at least one host.");
  return [...new Set(requested.map(normalizeHost))];
}

function normalizeScope(value = "user") {
  if (value !== "user" && value !== "project") throw new CliError(`--scope must be user or project, received: ${value}`);
  return value;
}

function homeDirectory(env = process.env, platform = process.platform, fallback = os.homedir()) {
  const candidates = platform === "win32" ? [env.USERPROFILE, env.HOME, fallback] : [env.HOME, fallback, env.USERPROFILE];
  const selected = candidates.find((item) => typeof item === "string" && item.trim());
  if (!selected) throw new CliError("Unable to determine the user home directory.");
  return path.resolve(selected);
}

function projectRoot(options = {}) {
  return path.resolve(options.project ?? process.cwd());
}

function userConfigRoot(host, { env = process.env, platform = process.platform, home = homeDirectory(env, platform) } = {}) {
  if (host === "claude-code") return path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"));
  if (host === "codex") return path.resolve(env.CODEX_HOME || path.join(home, ".codex"));
  if (host === "opencode") {
    if (env.OPENCODE_CONFIG_DIR) return path.resolve(env.OPENCODE_CONFIG_DIR);
    const xdg = env.XDG_CONFIG_HOME ? path.resolve(env.XDG_CONFIG_HOME) : path.join(home, ".config");
    return path.join(xdg, "opencode");
  }
  if (host === "gemini-cli") return path.resolve(env.GEMINI_CLI_HOME || path.join(home, ".gemini"));
  if (host === "antigravity") return path.join(home, ".gemini", "config");
  if (host === "oh-my-pi") return path.join(home, ".omp", "agent");
  throw new CliError(`Unsupported host: ${host}`);
}

function projectConfigRoot(host, root) {
  const project = path.resolve(root);
  if (host === "claude-code") return path.join(project, ".claude");
  if (host === "codex") return path.join(project, ".codex");
  if (host === "opencode") return path.join(project, ".opencode");
  if (host === "gemini-cli") return path.join(project, ".gemini");
  if (host === "antigravity") return path.join(project, ".agents");
  if (host === "oh-my-pi") return path.join(project, ".omp");
  throw new CliError(`Unsupported host: ${host}`);
}

function modelAgentRoot(host, scope, project, env = process.env) {
  if (scope === "project") return path.join(projectConfigRoot(host, project), "agents");
  const root = userConfigRoot(host, { env });
  if (host === "oh-my-pi") return path.join(root, "agents");
  return path.join(root, "agents");
}

function staticInstallRoots(host, scope, project, env = process.env) {
  const home = homeDirectory(env);
  if (host === "codex") {
    const codex = scope === "project" ? path.join(project, ".codex") : userConfigRoot("codex", { env, home });
    return {
      agents: path.join(codex, "agents"),
    };
  }
  if (host === "opencode") return { config: scope === "project" ? path.join(project, ".opencode") : userConfigRoot("opencode", { env, home }) };
  if (host === "gemini-cli") return { config: scope === "project" ? path.join(project, ".gemini") : userConfigRoot("gemini-cli", { env, home }) };
  if (host === "antigravity") {
    return {
      plugin: scope === "project"
        ? path.join(project, ".agents", "plugins", PLUGIN_ID)
        : path.join(home, ".gemini", "antigravity-cli", "plugins", PLUGIN_ID),
    };
  }
  throw new CliError(`Host ${host} does not use the static installer.`);
}

function stateFile(host, scope, project, env = process.env) {
  const home = homeDirectory(env);
  if (scope === "project") return path.join(project, ".oovz", "sew", `${host}.json`);
  if (process.platform === "win32" && env.LOCALAPPDATA) return path.join(path.resolve(env.LOCALAPPDATA), "oovz", "sew", `${host}.json`);
  const base = env.XDG_STATE_HOME ? path.resolve(env.XDG_STATE_HOME) : path.join(home, ".local", "state");
  return path.join(base, "oovz", "sew", `${host}.json`);
}

function normalizeRelative(value, label = "relative path") {
  const text = String(value).replaceAll("\\", "/");
  if (!text || text.startsWith("/") || /^[A-Za-z]:/u.test(text) || text.split("/").includes("..")) throw new CliError(`Invalid ${label}: ${value}`, 1);
  return text;
}

async function readTree(directory) {
  const result = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new CliError(`Unexpected symlink in package payload: ${absolute}`, 1);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: await readFile(absolute) });
      else throw new CliError(`Unsupported package payload entry: ${absolute}`, 1);
    }
  }
  await walk(directory);
  return result;
}

async function payloadManifest() {
  let value;
  try {
    value = JSON.parse(await readFile(path.join(PAYLOAD_ROOT, "manifest.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new CliError("This source checkout does not contain release payloads. Use the published @oovz/sew package, or run npm run bundle:sew and execute release-build/sew/package/bin/sew.mjs.", 1);
    }
    throw error;
  }
  const staticHosts = [...STATIC_INSTALL_HOSTS];
  if (value?.schemaVersion !== 2 || value.package !== PACKAGE_NAME || value.plugin !== PLUGIN_ID || !staticHosts.every((host) => value.staticHosts?.includes(host))) {
    throw new CliError("The packaged Senior Engineering Workflow payload manifest is invalid or incomplete.", 1);
  }
  return value;
}

async function staticPlan(host, scope, project, env = process.env) {
  const roots = staticInstallRoots(host, scope, project, env);
  const artifacts = await readTree(path.join(PAYLOAD_ROOT, host));
  const files = [];
  if (host === "codex") {
    for (const artifact of artifacts) {
      if (!artifact.path.startsWith("companion/agents/")) continue;
      files.push({ root: "agents", path: normalizeRelative(artifact.path.slice("companion/agents/".length)), content: artifact.content });
    }
  } else if (host === "opencode") {
    for (const artifact of artifacts) if (artifact.path.startsWith(".opencode/")) files.push({ root: "config", path: normalizeRelative(artifact.path.slice(".opencode/".length)), content: artifact.content });
  } else if (host === "gemini-cli") {
    for (const artifact of artifacts) {
      if (artifact.path.startsWith("skills/") || artifact.path.startsWith("agents/")) files.push({ root: "config", path: normalizeRelative(artifact.path), content: artifact.content });
    }
  } else if (host === "antigravity") {
    for (const artifact of artifacts) files.push({ root: "plugin", path: normalizeRelative(artifact.path), content: artifact.content });
  }
  if (files.length === 0) throw new CliError(`The packaged ${host} payload contains no installable files.`, 1);
  for (const file of files) {
    if (!roots[file.root]) throw new CliError(`Payload references unknown root ${file.root}.`, 1);
    file.destination = path.join(roots[file.root], ...file.path.split("/"));
    file.sha256 = createHash("sha256").update(file.content).digest("hex");
    await assertSafePath(roots[file.root], file.destination);
  }
  return { roots, files };
}

function installStateRootKey(state, root) {
  if (!Object.hasOwn(state.roots, root)) throw new CliError(`Install state references unknown root ${root}.`, 1);
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function validateInstallState(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliError("The Senior Engineering Workflow installation state is invalid.", 1);
  const allowedKeys = new Set(["schemaVersion", "package", "packageVersion", "plugin", "pluginVersion", "host", "scope", "roots", "files", "models"]);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) throw new CliError(`The installation state contains an unknown field: ${unknownKey}.`, 1);
  if (value.package !== PACKAGE_NAME || value.plugin !== PLUGIN_ID) throw new CliError("The Senior Engineering Workflow installation state is invalid.", 1);
  if (value.schemaVersion !== INSTALL_STATE_SCHEMA) throw new CliError(`Unsupported Senior Engineering Workflow installation-state schema ${value.schemaVersion ?? "missing"}; remove the old managed installation and install again.`, 1);
  if (value.host !== expected.host || value.scope !== expected.scope) throw new CliError("The Senior Engineering Workflow installation state belongs to another host or scope.", 1);
  if (typeof value.packageVersion !== "string" || !value.packageVersion || typeof value.pluginVersion !== "string" || !value.pluginVersion) throw new CliError("The installation state has invalid version metadata.", 1);
  if (!value.roots || typeof value.roots !== "object" || Array.isArray(value.roots)) throw new CliError("The installation state has invalid roots.", 1);
  const actualRootKeys = Object.keys(value.roots).sort();
  const expectedRootKeys = Object.keys(expected.roots).sort();
  if (JSON.stringify(actualRootKeys) !== JSON.stringify(expectedRootKeys)) throw new CliError("The installation state roots do not match the selected host and scope.", 1);
  for (const root of expectedRootKeys) {
    if (typeof value.roots[root] !== "string" || comparablePath(value.roots[root]) !== comparablePath(expected.roots[root])) {
      throw new CliError(`The installation state root ${root} does not match the selected host and scope.`, 1);
    }
  }
  if (!Array.isArray(value.files)) throw new CliError("The installation state has invalid files.", 1);
  const seen = new Set();
  for (const entry of value.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new CliError("The installation state contains an invalid file entry.", 1);
    const entryKeys = Object.keys(entry).sort();
    if (JSON.stringify(entryKeys) !== JSON.stringify(["path", "root", "sha256"])) throw new CliError("The installation state contains an invalid file entry shape.", 1);
    installStateRootKey(value, entry.root);
    const relative = normalizeRelative(entry.path, "state path");
    const key = `${entry.root}:${process.platform === "win32" ? relative.toLowerCase() : relative}`;
    if (seen.has(key)) throw new CliError(`The installation state contains a duplicate file entry: ${entry.path}`, 1);
    seen.add(key);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) throw new CliError(`The installation state contains an invalid hash for ${entry.path}.`, 1);
  }
  validateStoredModels(value.models, value.host);
  return value;
}

async function readInstallState(file, expected) {
  try { return validateInstallState(JSON.parse(await readFile(file, "utf8")), expected); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new CliError(`Could not parse installation state ${file}: ${error.message}`, 1);
    throw error;
  }
}


async function planStaticOperation(operation, host, scope, project, options, env = process.env) {
  const manifest = await payloadManifest();
  const statePath = stateFile(host, scope, project, env);
  await assertSafePath(path.dirname(statePath), statePath);
  const expectedRoots = Object.fromEntries(Object.entries(staticInstallRoots(host, scope, project, env)).map(([key, value]) => [key, path.resolve(value)]));
  const currentState = await readInstallState(statePath, { host, scope, roots: expectedRoots });
  const plan = operation === "uninstall" ? { roots: currentState?.roots ?? expectedRoots, files: [] } : await staticPlan(host, scope, project, env);
  if (operation === "install" && currentState && !options.force) throw new CliError(`Senior Engineering Workflow is already installed for ${host}/${scope}; use sew update or reinstall with --force.`, 1);
  if (operation !== "install" && !currentState) throw new CliError(`No managed Senior Engineering Workflow installation exists for ${host}/${scope}.`, 1);

  const owned = new Map();
  if (currentState) {
    for (const entry of currentState.files) {
      const root = currentState.roots[entry.root];
      const destination = path.join(root, ...normalizeRelative(entry.path).split("/"));
      await assertSafePath(root, destination);
      owned.set(path.resolve(destination), { ...entry, destination, rootPath: root });
      const actual = await hashFile(destination);
      if (actual !== null && actual !== entry.sha256 && !options.force) throw new CliError(`Managed file was modified; refusing to overwrite or remove: ${destination}`, 1);
    }
  }

  const writes = [];
  if (operation !== "uninstall") {
    for (const file of plan.files) {
      const key = path.resolve(file.destination);
      const currentHash = await hashFile(file.destination);
      if (currentHash !== null && !owned.has(key) && !options.force) throw new CliError(`Destination exists and is not managed by ${PACKAGE_NAME}: ${file.destination}`, 1);
      writes.push(file);
    }
    const models = currentState?.models;
    if (models && Object.keys(models).length > 0) {
      for (const file of writes) {
        const role = ROLES.find((candidate) => path.basename(file.path) === `${PLUGIN_ID}-${candidate}${modelExtension(host)}`);
        const config = role !== undefined ? models[role] : undefined;
        if (!config) continue;
        const overlaid = applyModelOverlay(host, String(file.content), config);
        file.content = Buffer.from(overlaid);
        file.sha256 = createHash("sha256").update(file.content).digest("hex");
      }
    }
  }
  const next = new Set(writes.map((item) => path.resolve(item.destination)));
  const removals = [...owned.values()].filter((item) => !next.has(path.resolve(item.destination)));
  const roots = operation === "uninstall" ? (currentState?.roots ?? {}) : Object.fromEntries(Object.entries(plan.roots).map(([key, value]) => [key, path.resolve(value)]));
  const nextState = operation === "uninstall" ? null : {
    schemaVersion: INSTALL_STATE_SCHEMA,
    package: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    plugin: PLUGIN_ID,
    pluginVersion: manifest.pluginVersion,
    host,
    scope,
    roots,
    files: writes.map((file) => ({ root: file.root, path: file.path, sha256: file.sha256 })),
    ...(currentState?.models && Object.keys(currentState.models).length > 0 ? { models: currentState.models } : {}),
  };
  return { statePath, currentState, nextState, writes, removals, roots, pluginVersion: manifest.pluginVersion };
}

function nativeCommands(operation, host, scope, project, force = false) {
  const plugin = `${PLUGIN_ID}@${MARKETPLACE_ID}`;
  if (host === "claude-code") {
    if (force) throw new CliError("--force is not supported for Claude Code native plugin operations.");
    if (operation === "install") return [
      { argv: ["claude", "plugin", "marketplace", "add", MARKETPLACE_SOURCE, "--scope", scope], tolerateAlreadyExists: true, cwd: project },
      { argv: ["claude", "plugin", "install", plugin, "--scope", scope], cwd: project },
    ];
    if (operation === "update") return [{ argv: ["claude", "plugin", "update", plugin, "--scope", scope], cwd: project }];
    return [{ argv: ["claude", "plugin", "uninstall", plugin, "--scope", scope], cwd: project }];
  }
  if (host === "oh-my-pi") {
    if (operation === "install") return [
      { argv: ["omp", "plugin", "marketplace", "add", MARKETPLACE_SOURCE], tolerateAlreadyExists: true, cwd: project },
      { argv: ["omp", "plugin", "install", ...(force ? ["--force"] : []), "--scope", scope, plugin], cwd: project },
    ];
    if (operation === "update") return [{ argv: ["omp", "plugin", "upgrade", "--scope", scope, plugin], cwd: project }];
    return [{ argv: ["omp", "plugin", "uninstall", "--scope", scope, plugin], cwd: project }];
  }
  throw new CliError(`Host ${host} does not use native installation.`);
}

function codexPluginIdentifier(plugin) {
  if (!plugin || typeof plugin !== "object") return null;
  for (const key of ["pluginId", "plugin_id", "id", "qualifiedName"]) {
    if (typeof plugin[key] === "string") return plugin[key];
  }
  const name = plugin.name ?? plugin.pluginName;
  const marketplace = plugin.marketplaceName ?? plugin.marketplace;
  if (typeof name === "string" && typeof marketplace === "string") return `${name}@${marketplace}`;
  return null;
}

function parseCodexPluginStatus(stdout) {
  let value;
  try {
    value = JSON.parse(String(stdout ?? ""));
  } catch (error) {
    throw new CliError(`Could not parse codex plugin list --json: ${error.message}. Re-run with --force to reinstall the marketplace skill and companion agents.`, 1);
  }

  let records;
  if (Array.isArray(value?.installed)) records = value.installed;
  else if (Array.isArray(value)) records = value;
  else if (Array.isArray(value?.plugins)) records = value.plugins.filter((item) => item?.installed === true);
  else throw new CliError("codex plugin list --json did not return an installed-plugin list. Re-run with --force to reinstall the marketplace skill and companion agents.", 1);

  const plugin = records.find((item) => codexPluginIdentifier(item) === CODEX_PLUGIN_ID);
  if (!plugin) return { installed: false, enabled: false, version: undefined };
  return {
    installed: plugin.installed !== false,
    enabled: plugin.enabled !== false && plugin.disabled !== true,
    version: plugin.version,
  };
}

function inspectCodexPlugin(project, runner = defaultSpawnSync, env = process.env) {
  const result = spawnHost("codex", ["plugin", "list", "--json"], { cwd: project, stdio: "pipe", spawnSync: runner, env });
  if (result.error) {
    if (result.error.code === "SEW_INVALID_CWD") throw new CliError(result.error.message, 1);
    if (result.error.code === "ENOENT") throw new CliError("Could not find the codex CLI on PATH. Install the Codex CLI (curl -fsSL https://chatgpt.com/codex/install.sh | sh) or add it to PATH, then re-run.", 1);
    throw new CliError(`Could not inspect Codex plugins: ${result.error.message}. Re-run with --force to reinstall the marketplace skill and companion agents.`, 1);
  }
  if ((result.status ?? 1) !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    throw new CliError(`codex plugin list --json failed (${result.status})${stderr ? `: ${stderr}` : ""}. Re-run with --force to reinstall the marketplace skill and companion agents.`, 1);
  }
  return parseCodexPluginStatus(result.stdout);
}

function codexPluginInstallCommands(project) {
  return [
    { argv: ["codex", "plugin", "marketplace", "add", MARKETPLACE_SOURCE], tolerateAlreadyExists: true, cwd: project },
    { argv: ["codex", "plugin", "add", CODEX_PLUGIN_ID], cwd: project },
  ];
}

function commandDisplay(argv) {
  return argv.map((value) => /[\s"']/u.test(value) ? JSON.stringify(value) : value).join(" ");
}

function executeNative(commands, options = {}) {
  const runner = options.spawnSync ?? defaultSpawnSync;
  const results = [];
  for (const command of commands) {
    const display = commandDisplay(command.argv);
    if (options.dryRun) { results.push({ command: display, status: "would-run" }); continue; }
    const [executable, ...args] = command.argv;
    const captureOutput = options.json || command.tolerateAlreadyExists;
    const result = spawnHost(executable, args, { cwd: command.cwd, stdio: captureOutput ? "pipe" : "inherit", spawnSync: runner, env: options.env ?? process.env });
    const stderr = captureOutput ? String(result.stderr ?? "") : "";
    const stdout = captureOutput ? String(result.stdout ?? "") : "";
    const alreadyExists = command.tolerateAlreadyExists && /already|exists|configured|duplicate/iu.test(`${stdout}\n${stderr}`);
    if (result.error) {
      if (result.error.code === "SEW_INVALID_CWD") throw new CliError(result.error.message, 1);
      if (result.error.code === "ENOENT") throw new CliError(`Could not find the ${executable} CLI on PATH. Install it or add it to PATH, then re-run.`, 1);
      throw new CliError(`Could not execute ${executable}: ${result.error.message}`, 1);
    }
    if (!options.json && captureOutput) {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
    if ((result.status ?? 1) !== 0 && !alreadyExists) throw new CliError(`Native command failed (${result.status}): ${display}${stderr ? `\n${stderr.trim()}` : ""}`, 1);
    results.push({ command: display, status: alreadyExists ? "already-configured" : "completed", exitCode: result.status ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
  }
  return results;
}


function parseOpenCodeAgentList(stdout) {
  const names = new Set();
  for (const line of String(stdout ?? "").replaceAll("\r\n", "\n").split("\n")) {
    const match = line.match(/^([^\s]+)\s+\((?:all|primary|subagent)\)$/u);
    if (match) names.add(match[1]);
  }
  return ROLES.map((role) => `${PLUGIN_ID}-${role}`).filter((name) => names.has(name));
}

function inspectOpenCodeDiscovery(project, env = process.env, runner = defaultSpawnSync) {
  const expected = ROLES.map((role) => `${PLUGIN_ID}-${role}`);
  const base = {
    command: "opencode agent list",
    expected,
    message: "OpenCode installs one Agent Skill and four Markdown subagents; it does not register a JavaScript/TypeScript plugin.",
  };
  const result = spawnHost("opencode", ["agent", "list"], { cwd: project, env, stdio: "pipe", spawnSync: runner });
  if (result.error) {
    const detail = result.error.code === "ENOENT"
      ? "OpenCode CLI was not found on PATH; restart OpenCode and run opencode agent list to verify discovery."
      : result.error.message;
    return { ...base, status: "not-checked", found: [], missing: expected, detail };
  }
  if ((result.status ?? 1) !== 0) {
    const detail = String(result.stderr ?? "").trim() || `opencode agent list exited with status ${result.status}.`;
    return { ...base, status: "not-checked", found: [], missing: expected, detail };
  }
  const found = parseOpenCodeAgentList(result.stdout);
  const missing = expected.filter((name) => !found.includes(name));
  if (missing.length > 0) {
    return { ...base, status: "not-discovered", found, missing, detail: `OpenCode did not discover: ${missing.join(", ")}. Check the reported installation paths and OpenCode version.` };
  }
  return { ...base, status: "verified", found, missing: [], detail: "Restart any already-running OpenCode session so it loads the newly installed agents and skill." };
}

function printOperation(result, json) {
  if (json) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return; }
  process.stdout.write(`${result.status}: ${result.host}/${result.scope}\n`);
  for (const item of result.actions ?? []) process.stdout.write(`- ${item.action ?? item.status} ${item.path ?? item.command}\n`);
  if (result.discovery) {
    process.stdout.write(`- ${result.discovery.status} ${result.discovery.message}\n`);
    if (result.discovery.detail) process.stdout.write(`  ${result.discovery.detail}\n`);
  }
}

function staticOperationActions(operation, plan) {
  if (operation === "uninstall") return plan.removals.map((item) => ({ action: "remove", path: item.destination }));
  return [
    ...plan.writes.map((item) => ({ action: plan.currentState ? "update" : "create", path: item.destination })),
    ...plan.removals.map((item) => ({ action: "remove", path: item.destination })),
  ];
}

async function runCodexOperation(operation, options, runtime, scope, project) {
  const plan = await planStaticOperation(operation, "codex", scope, project, options, runtime.env ?? process.env);
  const companionActions = staticOperationActions(operation, plan);
  let plugin;
  let pluginActions = [];

  if (operation === "uninstall") {
    plugin = {
      status: "preserved",
      managedBy: "codex",
      detail: "The Codex marketplace skill is not owned or removed by @oovz/sew.",
    };
  } else if (options["dry-run"]) {
    if (options.force) {
      pluginActions = executeNative(codexPluginInstallCommands(project), { dryRun: true, json: options.json === true, spawnSync: runtime.spawnSync });
      plugin = { status: "would-reinstall", inspected: false };
    } else {
      pluginActions = [
        { command: commandDisplay(["codex", "plugin", "list", "--json"]), status: "would-inspect" },
        ...codexPluginInstallCommands(project).map((command) => ({ command: commandDisplay(command.argv), status: "if-missing-or-disabled" })),
      ];
      plugin = { status: "conditional", inspected: false };
    }
  } else {
    const inspected = options.force ? null : inspectCodexPlugin(project, runtime.spawnSync ?? defaultSpawnSync, runtime.env ?? process.env);
    const installPlugin = options.force === true || !inspected.installed || !inspected.enabled;
    if (installPlugin) {
      pluginActions = executeNative(codexPluginInstallCommands(project), { json: options.json === true, spawnSync: runtime.spawnSync, env: runtime.env ?? process.env });
    }
    plugin = {
      status: options.force ? "reinstalled" : installPlugin ? "installed" : "already-installed",
      inspected: options.force !== true,
      ...(inspected ?? {}),
    };
  }

  if (!options["dry-run"]) await commitManagedOperation(operation, plan);
  const completedStatus = { install: "installed", update: "updated", uninstall: "uninstalled" }[operation];
  const result = {
    command: operation,
    status: options["dry-run"] ? "dry-run" : completedStatus,
    host: "codex",
    scope,
    method: "hybrid",
    pluginVersion: plan.pluginVersion,
    statePath: plan.statePath,
    plugin,
    actions: [...pluginActions, ...companionActions],
  };
  printOperation(result, options.json);
  return 0;
}

async function runInstallOperation(operation, options, runtime = {}) {
  const host = normalizeHost(options.host);
  const scope = normalizeScope(options.scope);
  const project = projectRoot(options);
  if (options.project !== undefined && scope !== "project") throw new CliError("--project is valid only with --scope project.");
  if (host === "codex") return runCodexOperation(operation, options, runtime, scope, project);
  if (NATIVE_INSTALL_HOSTS.has(host)) {
    const commands = nativeCommands(operation, host, scope, project, options.force === true);
    const actions = executeNative(commands, { dryRun: options["dry-run"] === true, json: options.json === true, spawnSync: runtime.spawnSync, env: runtime.env ?? process.env });
    const completedStatus = { install: "installed", update: "updated", uninstall: "uninstalled" }[operation];
    const result = { command: operation, status: options["dry-run"] ? "dry-run" : completedStatus, host, scope, method: "native", actions };
    printOperation(result, options.json);
    return 0;
  }
  if (!STATIC_INSTALL_HOSTS.has(host)) throw new CliError(`Unsupported install host: ${host}`);
  const plan = await planStaticOperation(operation, host, scope, project, options, runtime.env ?? process.env);
  const actions = staticOperationActions(operation, plan);
  if (!options["dry-run"]) await commitManagedOperation(operation, plan);
  const discovery = host === "opencode" && operation !== "uninstall"
    ? options["dry-run"]
      ? { status: "would-verify", expected: ROLES.map((role) => `${PLUGIN_ID}-${role}`), command: "opencode agent list", message: "OpenCode installs one Agent Skill and four Markdown subagents; it does not register a JavaScript/TypeScript plugin." }
      : inspectOpenCodeDiscovery(project, runtime.env ?? process.env, runtime.spawnSync ?? defaultSpawnSync)
    : undefined;
  const completedStatus = { install: "installed", update: "updated", uninstall: "uninstalled" }[operation];
  const discoveryFailed = discovery?.status === "not-discovered";
  const result = {
    command: operation,
    status: options["dry-run"] ? "dry-run" : discoveryFailed ? `${completedStatus}-but-not-discovered` : completedStatus,
    host,
    scope,
    method: "static",
    pluginVersion: plan.pluginVersion,
    statePath: plan.statePath,
    actions,
    ...(discovery ? { discovery } : {}),
  };
  printOperation(result, options.json);
  return discoveryFailed ? 1 : 0;
}

async function configureModels(options, runtime = {}) {
  const host = normalizeHost(options.host);
  const scope = normalizeScope(options.scope);
  const preset = normalizePreset(options.preset);
  const project = projectRoot(options);
  const env = runtime.env ?? process.env;
  if (options.project !== undefined && scope !== "project") throw new CliError("--project is valid only with --scope project.");
  const mapping = parseRoleMap(options.map, PRESETS[preset]);
  validateModelConfiguration(host, preset, mapping, options);
  const statePath = stateFile(host, scope, project, env);
  await assertSafePath(path.dirname(statePath), statePath);
  const expectedRoots = Object.fromEntries(Object.entries(staticInstallRoots(host, scope, project, env)).map(([key, value]) => [key, path.resolve(value)]));
  const state = await readInstallState(statePath, { host, scope, roots: expectedRoots });
  if (!state) throw new CliError(`No managed ${host}/${scope} installation exists. Run sew install --host ${host} --scope ${scope} first, then configure models.`, 1);
  const edits = [];
  for (const role of ROLES) {
    const fileName = `${PLUGIN_ID}-${role}${modelExtension(host)}`;
    const entry = state.files.find((file) => path.basename(file.path) === fileName);
    if (!entry) throw new CliError(`The managed ${host}/${scope} installation does not contain the ${role} agent file.`, 1);
    const root = state.roots[entry.root];
    const destination = path.join(root, ...normalizeRelative(entry.path).split("/"));
    await assertSafePath(root, destination);
    if (!(await pathInfo(destination))) throw new CliError(`The installed ${host}/${scope} ${role} agent is missing. Run sew update --host ${host} --scope ${scope} first.`, 1);
    const current = await readFile(destination, "utf8");
    const currentHash = await hashFile(destination);
    const managed = currentHash === entry.sha256;
    if (!managed && !options.force) throw new CliError(`Refusing to edit ${destination} because it was modified outside ${PACKAGE_NAME}. Use --force only after reviewing it.`, 1);
    const slot = mapping[role];
    const config = slot === "inherit" ? {} : slotConfiguration(slot, options);
    const next = applyModelOverlay(host, current, config);
    edits.push({ role, slot, path: destination, action: next === current ? "unchanged" : "update", content: next });
  }
  if (!options["dry-run"]) {
    const models = {};
    for (const role of ROLES) {
      const slot = mapping[role];
      if (slot === "inherit") continue;
      models[role] = slotConfiguration(slot, options);
    }
    const editsByPath = new Map(edits.map((item) => [path.resolve(item.path), item]));
    const files = state.files.map((entry) => {
      const destination = path.join(state.roots[entry.root], ...normalizeRelative(entry.path).split("/"));
      const edit = editsByPath.get(path.resolve(destination));
      return edit ? { ...entry, sha256: createHash("sha256").update(edit.content).digest("hex") } : entry;
    });
    const { models: _previousModels, ...stateWithoutModels } = state;
    const nextState = { ...stateWithoutModels, files, ...(Object.keys(models).length > 0 ? { models } : {}) };
    await commitManagedOperation("models", {
      statePath,
      nextState,
      writes: edits.filter((item) => item.action === "update").map((item) => ({ destination: item.path, content: Buffer.from(item.content) })),
      removals: [],
      roots: state.roots,
    });
  }
  const result = { command: "models configure", status: options["dry-run"] ? "dry-run" : "configured", host, scope, preset, statePath, mapping, files: edits.map(({ content: _content, ...item }) => item) };
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`${result.status}: ${host}/${scope}\n`);
    for (const item of result.files) process.stdout.write(`- ${item.action.padEnd(18)} ${item.path}\n`);
  }
  return 0;
}

function unquote(value) {
  const text = String(value).trim();
  if (!text) return "";
  if (text.startsWith('"') && text.endsWith('"')) { try { return JSON.parse(text); } catch { return text.slice(1, -1); } }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  if (text === "true") return true;
  if (text === "false") return false;
  return text;
}

function parseFrontmatterScalars(content) {
  const normalized = String(content).replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("unterminated frontmatter");
  const output = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u);
    if (match) output[match[1]] = unquote(match[2]);
  }
  return output;
}

function parseTomlScalars(content) {
  const sections = new Map([["", {}]]);
  let current = "";
  for (const raw of String(content).replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.replace(/\s+#.*$/u, "").trim();
    if (!line) continue;
    const section = line.match(/^\[([^\]]+)\]$/u);
    if (section) { current = section[1]; if (!sections.has(current)) sections.set(current, {}); continue; }
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u);
    if (assignment) sections.get(current)[assignment[1]] = unquote(assignment[2]);
  }
  return sections;
}

function parseJsonc(content) {
  return JSON.parse(String(content).replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, ""));
}

async function listAgentFiles(directory, extension) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).map((entry) => path.join(directory, entry.name)).sort();
  } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

function finding(level, code, message, details) { return { level, code, message, ...(details === undefined ? {} : { details }) }; }

async function scanMarkdownAgents(directory, scope, host) {
  const definitions = [];
  const findings = [];
  for (const file of await listAgentFiles(directory, ".md")) {
    try {
      const content = await readFile(file, "utf8");
      const frontmatter = parseFrontmatterScalars(content);
      const model = frontmatter.model;
      const thinking = frontmatter.effort ?? frontmatter.variant ?? frontmatter["thinking-level"] ?? frontmatter.thinking;
      const canonical = path.basename(file).startsWith(`${PLUGIN_ID}-`);
      if (model === undefined && thinking === undefined && !isManagedModelContent(content) && !canonical) continue;
      definitions.push({ scope, path: file, name: frontmatter.name ?? path.basename(file, ".md"), model, thinking, generated: isManagedModelContent(content), canonical });
    } catch (error) { findings.push(finding("warning", "agent-parse", `Could not parse ${host} agent ${file}: ${error.message}`)); }
  }
  return { definitions, findings };
}

async function scanCodexAgents(directory, scope) {
  const definitions = [];
  const findings = [];
  for (const file of await listAgentFiles(directory, ".toml")) {
    try {
      const content = await readFile(file, "utf8");
      const root = parseTomlScalars(content).get("") ?? {};
      const canonical = path.basename(file).startsWith(`${PLUGIN_ID}-`);
      if (root.model === undefined && root.model_reasoning_effort === undefined && !isManagedModelContent(content) && !canonical) continue;
      definitions.push({ scope, path: file, name: root.name ?? path.basename(file, ".toml"), model: root.model, thinking: root.model_reasoning_effort, generated: isManagedModelContent(content), canonical });
    } catch (error) { findings.push(finding("warning", "agent-parse", `Could not parse Codex agent ${file}: ${error.message}`)); }
  }
  return { definitions, findings };
}

function duplicateFindings(definitions) {
  const byName = new Map();
  for (const definition of definitions) {
    const key = String(definition.name).toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(definition);
  }
  return [...byName.entries()].filter(([, items]) => items.length > 1).map(([name, items]) => finding("warning", "duplicate-agent", `Multiple model definitions were found for agent ${name}; host precedence determines the effective one.`, items));
}

async function inspectStaticState(host, project, env) {
  const installations = [];
  const findings = [];
  for (const scope of ["user", "project"]) {
    const file = stateFile(host, scope, project, env);
    try {
      const expectedRoots = Object.fromEntries(Object.entries(staticInstallRoots(host, scope, project, env)).map(([key, value]) => [key, path.resolve(value)]));
      const state = validateInstallState(JSON.parse(await readFile(file, "utf8")), { host, scope, roots: expectedRoots });
      const files = [];
      for (const entry of state.files) {
        const root = state.roots[entry.root];
        const destination = path.join(root, ...normalizeRelative(entry.path).split("/"));
        const actual = await hashFile(destination);
        files.push({ path: destination, expected: entry.sha256, actual, status: actual === entry.sha256 ? "current" : actual === null ? "missing" : "modified" });
      }
      if (files.some((item) => item.status !== "current")) findings.push(finding("warning", "installation-drift", `${host}/${scope} installation has missing or modified files.`, files));
      installations.push({ scope, statePath: file, pluginVersion: state.pluginVersion, files });
    } catch (error) {
      if (error?.code !== "ENOENT") findings.push(finding("warning", "installation-state", `Could not inspect ${host}/${scope} installation state ${file}: ${error.message}`));
    }
  }
  return { installations, findings };
}

async function inspectNativeState(host, project, env) {
  const installations = [];
  const findings = [];
  if (host === "oh-my-pi") {
    const home = homeDirectory(env);
    const candidates = [
      { scope: "user", path: path.join(home, ".omp", "plugins", "installed_plugins.json") },
      { scope: "project", path: path.join(project, ".omp", "plugins", "installed_plugins.json") },
    ];
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(await readFile(candidate.path, "utf8"));
        const text = JSON.stringify(value);
        installations.push({ scope: candidate.scope, statePath: candidate.path, detected: text.includes(PLUGIN_ID) });
      } catch (error) { if (error?.code !== "ENOENT") findings.push(finding("warning", "installation-state", `Could not parse ${candidate.path}: ${error.message}`)); }
    }
  } else {
    findings.push(finding("information", "native-install", "Claude Code plugin installation is managed by the host; doctor inspects model configuration and environment overrides but does not parse the host's private plugin cache."));
  }
  return { installations, findings };
}

async function inspectCodexConfig(file, scope) {
  try {
    const sections = parseTomlScalars(await readFile(file, "utf8"));
    const agents = sections.get("agents") ?? {};
    const settings = [];
    if (agents.default_subagent_model !== undefined || agents.default_subagent_reasoning_effort !== undefined) settings.push({ scope, path: file, defaultSubagentModel: agents.default_subagent_model, defaultSubagentThinking: agents.default_subagent_reasoning_effort });
    return { settings, findings: [] };
  } catch (error) { if (error?.code === "ENOENT") return { settings: [], findings: [] }; return { settings: [], findings: [finding("warning", "config-parse", `Could not parse Codex config ${file}: ${error.message}`)] }; }
}

async function inspectHost(host, project, env) {
  const definitions = [];
  const settings = [];
  const findings = [];
  const locations = [];
  for (const scope of ["user", "project"]) {
    const agents = modelAgentRoot(host, scope, project, env);
    locations.push({ scope, agents });
    const scan = host === "codex" ? await scanCodexAgents(agents, scope) : await scanMarkdownAgents(agents, scope, host);
    definitions.push(...scan.definitions);
    findings.push(...scan.findings);
  }
  findings.push(...duplicateFindings(definitions));
  if (host === "claude-code") {
    if (env.CLAUDE_CODE_SUBAGENT_MODEL) findings.push(finding("warning", "claude-model-env", "CLAUDE_CODE_SUBAGENT_MODEL may override agent model frontmatter.", { value: env.CLAUDE_CODE_SUBAGENT_MODEL }));
    if (env.CLAUDE_CODE_EFFORT_LEVEL) findings.push(finding("information", "claude-effort-env", "CLAUDE_CODE_EFFORT_LEVEL sets the session effort baseline.", { value: env.CLAUDE_CODE_EFFORT_LEVEL }));
  }
  if (host === "codex") {
    for (const scope of ["user", "project"]) {
      const root = scope === "user" ? userConfigRoot("codex", { env }) : projectConfigRoot("codex", project);
      const report = await inspectCodexConfig(path.join(root, "config.toml"), scope);
      settings.push(...report.settings);
      findings.push(...report.findings);
    }
    for (const setting of settings) findings.push(finding("warning", "codex-subagent-default", `Codex subagent defaults in ${setting.path} can replace parent inheritance.`, setting));
  }
  let installation;
  if (STATIC_INSTALL_HOSTS.has(host)) installation = await inspectStaticState(host, project, env);
  else installation = await inspectNativeState(host, project, env);
  findings.push(...installation.findings);
  if (host === "opencode") {
    findings.push(finding("information", "opencode-install-shape", "Senior Engineering Workflow is installed as one Agent Skill and four Markdown subagents, not as an OpenCode JavaScript/TypeScript plugin. Restart OpenCode after installation and verify with opencode agent list."));
  }
  if (host === "antigravity") {
    findings.push(finding("information", "antigravity-model-aliases", "Antigravity has no editable agents; model routing is inherit-only and the workflow uses inherited generic or dynamically defined subagents."));
  } else if (definitions.length === 0) {
    findings.push(finding("information", "no-model-aliases", "No explicit Senior Engineering Workflow model configuration was found."));
  }
  return { host, locations, definitions, settings, installations: installation.installations, findings };
}

async function doctor(options, runtime = {}) {
  const project = projectRoot(options);
  const hosts = normalizeDoctorHosts(options.host);
  const env = runtime.env ?? process.env;
  const reports = [];
  for (const host of hosts) reports.push(await inspectHost(host, project, env));
  const findings = reports.flatMap((report) => report.findings);
  const summary = {
    information: findings.filter((item) => item.level === "information").length,
    warnings: findings.filter((item) => item.level === "warning").length,
    errors: findings.filter((item) => item.level === "error").length,
  };
  const result = { command: "doctor", status: summary.errors ? "errors" : summary.warnings ? "warnings" : "healthy", packageVersion: PACKAGE_VERSION, projectRoot: project, hosts: reports, summary };
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Senior Engineering Workflow doctor: ${result.status}\n`);
    for (const report of reports) {
      process.stdout.write(`\n${report.host}\n`);
      for (const item of report.findings) process.stdout.write(`- [${item.level.toUpperCase()}] ${item.message}\n`);
    }
    process.stdout.write(`\nSummary: ${summary.information} information, ${summary.warnings} warnings, ${summary.errors} errors.\n`);
  }
  return summary.errors ? 1 : 0;
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  try {
    const { command, options } = parseArgs(argv);
    if (command === "help" || options.help) { process.stdout.write(usage()); return 0; }
    if (command === "version") { process.stdout.write(`${PACKAGE_VERSION}\n`); return 0; }
    if (["install", "update", "uninstall"].includes(command)) return await runInstallOperation(command, options, runtime);
    if (command === "models-configure") return await configureModels(options, runtime);
    if (command === "doctor") return await doctor(options, runtime);
    throw new CliError(`Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof CliError) { process.stderr.write(`sew: ${error.message}\n`); return error.exitCode; }
    process.stderr.write(`sew: unexpected error: ${error.stack ?? error.message}\n`);
    return 1;
  }
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) process.exitCode = await main();

export const internals = Object.freeze({
  HOSTS,
  ROLES,
  PRESETS,
  MODEL_MARKER,
  parseArgs,
  normalizePreset,
  parseRoleMap,
  homeDirectory,
  userConfigRoot,
  projectConfigRoot,
  modelAgentRoot,
  staticInstallRoots,
  stateFile,
  staticPlan,
  nativeCommands,
  spawnHost,
  inspectOpenCodeDiscovery,
  parseOpenCodeAgentList,
  commitManagedOperation,
  codexPluginIdentifier,
  parseCodexPluginStatus,
  inspectCodexPlugin,
  codexPluginInstallCommands,
  applyModelOverlay,
  parseFrontmatterScalars,
  parseTomlScalars,
  parseJsonc,
  isManagedModelContent,
  inspectHost,
  isContained,
});
