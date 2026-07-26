import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(ROOT, "plugins", "senior-engineering-workflow");
export const AGENT_ROLE_NAMES = Object.freeze([
  "workflow-researcher",
  "workflow-architect",
  "workflow-engineer",
  "workflow-tester",
  "workflow-reviewer",
]);

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function identical(source, destination) {
  if (!(await exists(destination))) return false;
  const [left, right] = await Promise.all([readFile(source), readFile(destination)]);
  return left.equals(right);
}

async function collectTree(source, destination) {
  const files = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) files.push(...await collectTree(from, to));
    else if (entry.isFile()) files.push({ source: from, destination: to });
  }
  return files;
}

function agentFiles(host, destination, extension) {
  return AGENT_ROLE_NAMES.map((role) => ({
    source: path.join(ROOT, "adapters", host, "agents", `${role}.${extension}`),
    destination: path.join(destination, "agents", `${role}.${extension}`),
  }));
}

async function installFiles(files, options) {
  const plans = [];
  for (const file of files) {
    if (await identical(file.source, file.destination)) {
      plans.push({ ...file, status: "unchanged" });
    } else if ((await exists(file.destination)) && !options.force) {
      throw new Error(`Refusing to overwrite ${file.destination}; no files were changed. Rerun with --force after reviewing it.`);
    } else {
      plans.push({ ...file, status: options.dryRun ? "would-copy" : "copied" });
    }
  }

  for (const plan of plans) {
    if (plan.status !== "copied") continue;
    await mkdir(path.dirname(plan.destination), { recursive: true });
    await cp(plan.source, plan.destination);
  }

  return plans.map(({ destination, status }) => ({ destination, status }));
}

function parseArguments(argv) {
  const host = argv[0];
  if (!new Set(["codex", "opencode", "gemini"]).has(host)) {
    throw new Error("Usage: node scripts/install-adapters.mjs <codex|opencode|gemini> [--scope user|project] [--project PATH] [--dry-run] [--force]");
  }

  const options = { host, scope: "user", project: process.cwd(), dryRun: false, force: false };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scope") options.scope = argv[++index];
    else if (argument === "--project") options.project = path.resolve(argv[++index]);
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force") options.force = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!new Set(["user", "project"]).has(options.scope)) {
    throw new Error("--scope must be user or project");
  }
  return options;
}

export async function installAdapters(options) {
  if (options.host === "codex") {
    const base = options.scope === "user" ? path.join(os.homedir(), ".codex") : path.join(options.project, ".codex");
    return installFiles(agentFiles("codex", base, "toml"), options);
  }

  if (options.host === "opencode") {
    const base = options.scope === "user" ? path.join(os.homedir(), ".config", "opencode") : path.join(options.project, ".opencode");
    const files = await collectTree(
      path.join(PLUGIN, "skills", "senior-engineering-workflow"),
      path.join(base, "skills", "senior-engineering-workflow"),
    );
    files.push(...agentFiles("opencode", base, "md"));
    return installFiles(files, options);
  }

  if (options.host === "gemini") {
    const target = options.scope === "project" ? options.project : ROOT;
    const skillsDest = path.join(target, "skills");
    const files = await collectTree(
      path.join(PLUGIN, "skills", "senior-engineering-workflow"),
      path.join(skillsDest, "senior-engineering-workflow"),
    );
    files.push(...agentFiles("gemini", target, "md"));
    return installFiles(files, options);
  }

  throw new Error(`Unsupported host: ${options.host}`);
}

if (typeof process !== "undefined" && fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const options = parseArguments(process.argv.slice(2));
  const results = await installAdapters(options);
  for (const result of results) console.log(`${result.status}: ${result.destination}`);
}
