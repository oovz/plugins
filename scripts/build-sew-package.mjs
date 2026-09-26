#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { atomicWriteTree } from "./lib/files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "senior-engineering-workflow";
const SOURCE_PACKAGE = "tools/sew";
const OUTPUT_ROOT = "release-build/sew";
const ROLES = Object.freeze(["researcher", "engineer", "verifier", "worker"]);
const CONFIG_SOURCES = Object.freeze({
  "claude-code": { projection: "claude-code", prefix: "agents/", extension: ".md", namespaceFrontmatter: true },
  codex: { projection: "codex", prefix: "companion/agents/", extension: ".toml" },
  opencode: { projection: "opencode", prefix: ".opencode/agents/", extension: ".md" },
  cursor: { projection: "cursor", prefix: "agents/", extension: ".md" },
  "gemini-cli": { projection: "gemini-cli", prefix: "agents/", extension: ".md" },
  antigravity: { projection: "antigravity", prefix: "agents/", extension: ".md" },
  "oh-my-pi": { projection: "oh-my-pi", prefix: "agents/", extension: ".md" },
});

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

async function readTree(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in generated configuration: ${absolute}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: await readFile(absolute), executable: ((await stat(absolute)).mode & 0o111) !== 0 });
      else throw new Error(`Unsupported configuration payload entry: ${absolute}`);
    }
  }
  await walk(directory);
  return files;
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function sourceRoleId(host, sourcePath) {
  const basename = path.posix.basename(sourcePath);
  const match = basename.match(new RegExp(`^${PLUGIN_ID}-(researcher|engineer|verifier|worker)\\.[^.]+$`, "u"));
  if (match) return match[1];
  const role = basename.replace(/\.[^.]+$/u, "");
  if (host === "claude-code" && ROLES.includes(role)) return role;
  return null;
}

function namespaceClaudeDefinition(content, role) {
  const source = content.toString("utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u);
  if (!match) throw new Error(`Claude ${role} agent has invalid YAML frontmatter`);
  const frontmatter = YAML.parse(match[1]);
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) throw new Error(`Claude ${role} agent frontmatter is not a mapping`);
  frontmatter.name = `${PLUGIN_ID}-${role}`;
  return Buffer.from(`---\n${YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n${match[2]}`, "utf8");
}

async function roleConfigurations(root, host, descriptor) {
  const projectionRoot = path.join(root, "dist", descriptor.projection, PLUGIN_ID);
  const candidates = await readTree(projectionRoot);
  const selected = new Map();
  for (const file of candidates) {
    if (!file.path.startsWith(descriptor.prefix) || !file.path.endsWith(descriptor.extension)) continue;
    const role = sourceRoleId(host, file.path);
    if (!role) continue;
    if (selected.has(role)) throw new Error(`${host} projection has multiple definitions for role ${role}`);
    const content = descriptor.namespaceFrontmatter ? namespaceClaudeDefinition(file.content, role) : file.content;
    selected.set(role, { path: `agents/${PLUGIN_ID}-${role}${descriptor.extension}`, content, executable: file.executable });
  }
  const missing = ROLES.filter((role) => !selected.has(role));
  if (missing.length) throw new Error(`${host} configuration projection is missing roles: ${missing.join(", ")}`);
  return ROLES.map((role) => selected.get(role));
}

function sourceCommit(options) {
  const value = options.sourceCommit ?? process.env.SEW_SOURCE_COMMIT;
  if (value === undefined || value === null || value === "") return null;
  if (!/^[a-f0-9]{40}$/iu.test(String(value))) throw new Error("SEW_SOURCE_COMMIT must be a 40-character Git commit SHA.");
  return String(value).toLowerCase();
}

export async function buildSewPackage(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const output = path.resolve(options.output ?? path.join(root, OUTPUT_ROOT, "package"));
  const sourceRoot = path.join(root, SOURCE_PACKAGE);
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  const pluginManifest = JSON.parse(await readFile(path.join(root, "plugins", PLUGIN_ID, "manifest.json"), "utf8"));
  if (manifest.name !== "@oovz/sew" || manifest.private !== true) throw new Error("tools/sew must remain the private source workspace.");
  if (pluginManifest.id !== PLUGIN_ID || pluginManifest.version !== manifest.version) throw new Error("SEW CLI and canonical role source versions must match.");
  const commit = sourceCommit(options);
  const hostFiles = {};
  const artifacts = [];
  for (const [host, descriptor] of Object.entries(CONFIG_SOURCES)) {
    hostFiles[host] = await roleConfigurations(root, host, descriptor);
    for (const file of hostFiles[host]) artifacts.push({ ...file, path: path.posix.join("payloads", "config", host, file.path) });
  }
  artifacts.push(...(await readTree(path.join(sourceRoot, "bin"))).map((file) => ({ ...file, path: path.posix.join("bin", file.path) })));
  artifacts.push(...(await readTree(path.join(sourceRoot, "lib"))).map((file) => ({ ...file, path: path.posix.join("lib", file.path) })));
  artifacts.push({ path: "README.md", content: await readFile(path.join(sourceRoot, "README.md")) });
  artifacts.push({ path: "LICENSE", content: await readFile(path.join(sourceRoot, "LICENSE")) });

  const roleDigest = digestFiles(Object.entries(hostFiles).flatMap(([host, files]) => files.map((file) => ({ ...file, path: `${host}/${file.path}` }))));
  const payloadManifest = {
    schemaVersion: 1,
    package: manifest.name,
    packageVersion: manifest.version,
    roleSourceVersion: pluginManifest.version,
    ...(commit ? { sourceCommit: commit } : {}),
    roles: ROLES.map((role) => `${PLUGIN_ID}-${role}`),
    hosts: Object.fromEntries(Object.entries(hostFiles).map(([host, files]) => [host, files.map((file) => file.path)])),
    roleDigest,
    repository: manifest.repository?.url,
  };
  artifacts.push({ path: "payloads/manifest.json", content: Buffer.from(json(payloadManifest)) });
  artifacts.push({ path: "package.json", content: Buffer.from(json({
    ...manifest,
    roleSourceVersion: pluginManifest.version,
    private: undefined,
    scripts: undefined,
    files: ["bin/", "lib/", "payloads/", "README.md", "LICENSE"],
    publishConfig: { access: "public", provenance: true },
    ...(commit ? { sourceCommit: commit } : {}),
  })) });

  await atomicWriteTree(output, artifacts, path.join(root, "release-build"));
  options.stdout?.write?.(`bundled ${path.relative(root, output)} as configuration-only host payloads\n`);
  return { root, output, packageVersion: manifest.version, artifacts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSewPackage({ stdout: process.stdout }).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
