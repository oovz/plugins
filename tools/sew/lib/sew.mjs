#!/usr/bin/env node
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CliError } from "./errors.mjs";
import { HOST_CONFIG, ROLE_IDS, normalizeHome, normalizeHost, packagedRolePath, roleAgentRoot, roleFileName } from "./host-config.mjs";
import { applyRoleOverride, preserveRoleOverrides, readRoleConfiguration, validateOverride } from "./model-config.mjs";

const PACKAGE_NAME = "@oovz/sew";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_MANIFEST = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
const PACKAGE_VERSION = PACKAGE_MANIFEST.version;
const PAYLOAD_ROOT = path.join(PACKAGE_ROOT, "payloads", "config");
const PAYLOAD_MANIFEST_PATH = path.join(PACKAGE_ROOT, "payloads", "manifest.json");
const HOSTS = Object.freeze(Object.keys(HOST_CONFIG));

const COMMANDS = Object.freeze({
  install: { values: ["host", "scope", "project"], flags: ["force", "dry-run", "json", "help"] },
  models: { values: ["host", "scope", "project", "role", "model", "reasoning"], flags: ["reset", "dry-run", "json", "help"] },
  doctor: { values: ["host", "project"], flags: ["json", "help"] },
});

function usage() {
  return `${PACKAGE_NAME} ${PACKAGE_VERSION}

Install host-native subagent configuration. Plugin and skill acquisition is managed by each harness.

Usage:
  sew install --host <host> [--scope <user|project>] [--project <path>] [--force] [--dry-run]
  sew models configure --host <host> --role <role> [--model <id>] [--reasoning <value>]
  sew models configure --host <host> --role <role> --reset
  sew doctor [--host <all|host,...>] [--project <path>]

Hosts:
  ${HOSTS.join(", ")}

Install replaces only the four SEW role files. Changed files require --force. Repeated installs of current files are safe.
Model overrides are syntax-checked from local host schemas. Install and model configuration do not fetch model catalogs or invoke host commands.
Doctor reads user and project role files and reports what it inspected; it does not verify that a host runs a model successfully.
`;
}

function parseArgs(argv) {
  const args = [...argv];
  if (!args.length) throw new CliError(`A command is required.\n\n${usage()}`);
  if (["--help", "-h"].includes(args[0])) return { command: "help", options: {} };
  if (["--version", "-v"].includes(args[0])) return { command: "version", options: {} };
  let command = args.shift();
  if (command === "models") {
    if (args.shift() !== "configure") throw new CliError("models requires the configure subcommand.");
  }
  const definition = COMMANDS[command];
  if (!definition) throw new CliError(`Unknown command: ${command}. Supported commands: install, models configure, doctor.`);
  const options = {};
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) throw new CliError(`Unexpected positional argument: ${token}`);
    const raw = token.slice(2);
    const equal = raw.indexOf("=");
    const key = equal < 0 ? raw : raw.slice(0, equal);
    if (Object.hasOwn(options, key)) throw new CliError(`Option --${key} may be provided only once.`);
    if (definition.flags.includes(key)) {
      if (equal >= 0) throw new CliError(`Boolean option --${key} does not accept a value.`);
      options[key] = true;
      continue;
    }
    if (!definition.values.includes(key)) throw new CliError(`Unknown option for ${command}: --${key}`);
    const value = equal < 0 ? args.shift() : raw.slice(equal + 1);
    if (value === undefined || value.startsWith("--") || !value.trim()) throw new CliError(`Option --${key} requires a value.`);
    options[key] = value;
  }
  if (options.help) return { command: "help", options: {} };
  if (command === "install" || command === "models") {
    options.host = normalizeHost(options.host);
    options.scope ??= "user";
    if (!["user", "project"].includes(options.scope)) throw new CliError("--scope must be user or project.");
    if (options.project && options.scope !== "project") throw new CliError("--project requires --scope project.");
    options.project = path.resolve(options.project ?? process.cwd());
    if (command === "models") {
      if (!ROLE_IDS.includes(options.role)) throw new CliError(`--role must be one of: ${ROLE_IDS.join(", ")}`);
      if (options.reset && (options.model !== undefined || options.reasoning !== undefined)) throw new CliError("--reset cannot be combined with --model or --reasoning.");
      if (!options.reset && options.model === undefined && options.reasoning === undefined) throw new CliError("Supply --model, --reasoning, or --reset.");
      if (!options.reset) validateOverride(options.host, options);
    }
  } else {
    options.host = options.host === undefined || options.host === "all" ? HOSTS : [...new Set(options.host.split(",").map((item) => normalizeHost(item.trim())))];
    if (typeof options.host === "string") options.host = [options.host];
    options.project = path.resolve(options.project ?? process.cwd());
  }
  return { command, options };
}

async function assertProject(project) {
  try {
    const info = await stat(project);
    if (!info.isDirectory()) throw new CliError(`Project root is not a directory: ${project}`);
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error?.code === "ENOENT") throw new CliError(`Project directory does not exist: ${project}`);
    throw new CliError(`Cannot read project directory ${project}: ${error.message}`);
  }
}

async function fileType(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new CliError(`Role target is not a regular file: ${file}`);
    return "file";
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error?.code === "ENOENT") return "missing";
    throw new CliError(`Cannot inspect role target ${file}: ${error.message}`);
  }
}

async function payloadManifest() {
  let manifest;
  try { manifest = JSON.parse(await readFile(PAYLOAD_MANIFEST_PATH, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") throw new CliError(`The ${PACKAGE_NAME} configuration payload is missing. Rebuild the release package.`);
    if (error instanceof SyntaxError) throw new CliError(`Could not parse configuration payload manifest: ${error.message}`);
    throw error;
  }
  if (manifest.schemaVersion !== 1 || manifest.package !== PACKAGE_NAME || manifest.packageVersion !== PACKAGE_VERSION || !manifest.hosts) {
    throw new CliError("The configuration payload manifest does not match this SEW package.");
  }
  return manifest;
}

async function installedRoleFiles(host, manifest) {
  const files = manifest.hosts[host];
  const expected = ROLE_IDS.map((role) => packagedRolePath(host, role)).sort();
  if (!Array.isArray(files) || JSON.stringify([...files].sort()) !== JSON.stringify(expected)) {
    throw new CliError(`The package is missing the complete ${host} role configuration.`);
  }
  const output = [];
  for (const role of ROLE_IDS) {
    const relative = packagedRolePath(host, role);
    const source = path.join(PAYLOAD_ROOT, host, ...relative.split("/"));
    if (path.relative(path.join(PAYLOAD_ROOT, host), source).startsWith("..")) throw new CliError(`Invalid packaged role path: ${relative}`);
    let content;
    try { content = await readFile(source); }
    catch (error) { throw new CliError(`Cannot read packaged ${host} role ${role} at ${source}: ${error.message}`); }
    readRoleConfiguration(host, content, role);
    output.push({ role, relative, content });
  }
  return output;
}

async function install(options) {
  if (options.scope === "project") await assertProject(options.project);
  const manifest = await payloadManifest();
  const sourceFiles = await installedRoleFiles(options.host, manifest);
  const root = roleAgentRoot(options.host, options.scope, options.project, process.env);
  const planned = [];
  for (const file of sourceFiles) {
    const destination = path.join(root, path.basename(file.relative));
    const state = await fileType(destination);
    const current = state === "file" ? await readFile(destination) : null;
    let content = file.content;
    if (current && !current.equals(file.content) && !options.force) {
      const retained = preserveRoleOverrides(options.host, current, file.content, file.role);
      if (retained === null) throw new CliError(`Role file already exists with different content: ${destination}. Review it, then rerun install with --force to replace this file.`, 1);
      content = Buffer.from(retained, "utf8");
    }
    planned.push({ ...file, content, destination, current });
  }
  const actions = planned.map((file) => ({ role: file.role, path: file.destination, action: file.current?.equals(file.content) ? "unchanged" : file.current ? "replace" : "create" }));
  if (!options["dry-run"]) {
    try { await mkdir(root, { recursive: true }); }
    catch (error) { throw new CliError(`Cannot create agent configuration directory ${root}: ${error.message}`, 1); }
    for (const file of planned) {
      if (file.current?.equals(file.content)) continue;
      try { await writeFile(file.destination, file.content); }
      catch (error) { throw new CliError(`Cannot write role file ${file.destination}: ${error.message}`, 1); }
    }
  }
  return { command: "install", status: options["dry-run"] ? "dry-run" : "installed", host: options.host, scope: options.scope, root, actions };
}

async function configureModel(options) {
  if (options.scope === "project") await assertProject(options.project);
  const root = roleAgentRoot(options.host, options.scope, options.project, process.env);
  const file = path.join(root, roleFileName(options.host, options.role));
  if ((await fileType(file)) !== "file") throw new CliError(`Role configuration is missing: ${file}. Run sew install for ${options.host}/${options.scope} first.`);
  let source;
  try { source = await readFile(file, "utf8"); }
  catch (error) { throw new CliError(`Cannot read role configuration ${file}: ${error.message}`); }
  const current = readRoleConfiguration(options.host, source, options.role);
  const next = options.reset
    ? applyRoleOverride(options.host, source, { reset: true })
    : applyRoleOverride(options.host, source, options);
  readRoleConfiguration(options.host, next, options.role);
  if (!options["dry-run"] && next !== source) {
    try { await writeFile(file, next, "utf8"); }
    catch (error) { throw new CliError(`Cannot write role configuration ${file}: ${error.message}`); }
  }
  return {
    command: "models configure",
    status: options["dry-run"] ? "dry-run" : next === source ? "unchanged" : "configured",
    host: options.host,
    scope: options.scope,
    role: options.role,
    path: file,
    previous: { model: current.model ?? null, reasoning: current.reasoning ?? null },
    current: readRoleConfiguration(options.host, next, options.role),
  };
}

async function inspectRoot(host, scope, project, env) {
  const root = roleAgentRoot(host, scope, project, env);
  const roles = [];
  for (const role of ROLE_IDS) {
    const file = path.join(root, roleFileName(host, role));
    let status;
    try { status = await fileType(file); }
    catch (error) {
      roles.push({ role, path: file, status: "invalid", error: error.message });
      continue;
    }
    if (status === "missing") {
      roles.push({ role, path: file, status: "missing" });
      continue;
    }
    try {
      const config = readRoleConfiguration(host, await readFile(file, "utf8"), role);
      roles.push({ role, path: file, status: "valid", name: config.name, model: config.model ?? null, reasoning: config.reasoning ?? null });
    } catch (error) {
      roles.push({ role, path: file, status: "invalid", error: error.message });
    }
  }
  return { scope, root, roles };
}

async function doctor(options) {
  await assertProject(options.project);
  const reports = [];
  const home = normalizeHome(process.env);
  for (const host of options.host) {
    const user = await inspectRoot(host, "user", options.project, process.env);
    const project = await inspectRoot(host, "project", options.project, process.env);
    const coverage = ROLE_IDS.map((role) => ({
      role,
      scopes: [user, project].filter((inventory) => inventory.roles.some((item) => item.role === role && item.status === "valid")).map((inventory) => inventory.scope),
    }));
    const duplicates = coverage.filter((item) => item.scopes.length === 2).map((item) => item.role);
    const statuses = [...user.roles, ...project.roles];
    reports.push({ host, home, user, project, coverage, duplicates, status: statuses.some((item) => item.status === "invalid") ? "invalid" : coverage.every((item) => item.scopes.length > 0) ? "configuration-valid" : "incomplete" });
  }
  const status = reports.some((report) => report.status === "invalid")
    ? "invalid"
    : reports.every((report) => report.status === "configuration-valid")
      ? "configuration-valid"
      : "incomplete";
  return { command: "doctor", status, projectRoot: options.project, checked: "documented agent files and configuration syntax; model execution was not checked", hosts: reports };
}

function printResult(result, jsonOutput) {
  if (jsonOutput) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return; }
  if (result.command === "install") {
    process.stdout.write(`${result.status}: ${result.host}/${result.scope} at ${result.root}\n`);
    for (const file of result.actions) process.stdout.write(`- ${file.action} ${file.path}\n`);
  } else if (result.command === "models configure") {
    process.stdout.write(`${result.status}: ${result.host}/${result.scope}/${result.role} at ${result.path}\n`);
  } else {
    for (const host of result.hosts) {
      process.stdout.write(`${host.status}: ${host.host}\n`);
      for (const inventory of [host.user, host.project]) {
        for (const item of inventory.roles) {
          const details = item.status === "valid"
            ? `, name ${item.name}${item.model ? `, model ${item.model}` : ""}${item.reasoning ? `, reasoning ${item.reasoning}` : ""}`
            : item.error ? `, ${item.error}` : "";
          process.stdout.write(`- ${inventory.scope}/${item.role}: ${item.status} at ${item.path}${details}\n`);
        }
      }
      if (host.duplicates.length) process.stdout.write(`Duplicate roles: ${host.duplicates.join(", ")}\n`);
    }
    process.stdout.write(`Checked ${result.checked}.\n`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const jsonOutput = argv.includes("--json");
  try {
    const parsed = parseArgs(argv);
    const options = parsed.options;
    if (parsed.command === "help") { process.stdout.write(`${usage()}\n`); return 0; }
    if (parsed.command === "version") { process.stdout.write(`${PACKAGE_VERSION}\n`); return 0; }
    const result = parsed.command === "install"
      ? await install(options)
      : parsed.command === "models"
        ? await configureModel(options)
        : await doctor(options);
    printResult(result, options.json === true);
    return result.status === "invalid" ? 1 : 0;
  } catch (error) {
    const message = error instanceof CliError ? error.message : `Unexpected error: ${error.message}`;
    if (jsonOutput) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
    else process.stderr.write(`sew: ${message}\n`);
    return error instanceof CliError ? error.exitCode : 1;
  }
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) process.exitCode = await main();

export const internals = Object.freeze({
  HOSTS,
  ROLE_IDS,
  HOST_CONFIG,
  packageVersion: PACKAGE_VERSION,
  parseArgs,
  normalizeHome,
  normalizeHost,
  roleAgentRoot,
  roleFileName,
  packagedRolePath,
  payloadManifest,
  installedRoleFiles,
  install,
  configureModel,
  inspectRoot,
  doctor,
});
