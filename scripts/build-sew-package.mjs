#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const PLUGIN_ID = "senior-engineering-workflow";
const PACKAGE_SOURCE = path.join("packages", "sew");
const RELEASE_BUILD_ROOT = path.join("release-build", "sew");
const PACKAGE_OUTPUT = path.join(RELEASE_BUILD_ROOT, "package");
const STATIC_PAYLOADS = Object.freeze({
  codex: path.join("dist", "codex", PLUGIN_ID),
  opencode: path.join("dist", "opencode", "stable", PLUGIN_ID),
  "gemini-cli": path.join("dist", "gemini-cli", PLUGIN_ID),
  antigravity: path.join("dist", "antigravity", PLUGIN_ID),
});
const ALL_HOSTS = Object.freeze(["claude-code", "codex", "opencode", "gemini-cli", "antigravity", "oh-my-pi"]);

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathInfo(file) {
  try { return await lstat(file); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function nearestExisting(target) {
  let current = path.resolve(target);
  while (true) {
    if (await pathInfo(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No existing ancestor for ${target}`);
    current = parent;
  }
}

async function assertSafePath(root, target) {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isContained(absoluteRoot, absoluteTarget)) throw new Error(`Generated path escapes ${absoluteRoot}: ${absoluteTarget}`);
  const start = await nearestExisting(absoluteRoot);
  let current = start;
  for (const part of ["", ...path.relative(start, absoluteTarget).split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    const info = await pathInfo(current);
    if (info?.isSymbolicLink()) throw new Error(`Refusing symlink or junction in generated path: ${current}`);
  }
}

function normalizeArtifactPath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Invalid generated artifact path: ${value}`);
  }
  return normalized;
}

async function readTree(directory) {
  const result = [];
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in release input: ${absolute}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push({
        path: path.relative(directory, absolute).split(path.sep).join("/"),
        content: await readFile(absolute),
        executable: ((await stat(absolute)).mode & 0o111) !== 0,
      });
      else throw new Error(`Unsupported release input entry: ${absolute}`);
    }
  }
  try { await walk(directory); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  return result;
}

async function atomicWriteTree(target, artifacts, containmentRoot) {
  await assertSafePath(containmentRoot, target);
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const staging = path.join(parent, `.${path.basename(target)}.staging-${token}`);
  const backup = path.join(parent, `.${path.basename(target)}.backup-${token}`);
  await mkdir(staging);
  try {
    for (const artifact of artifacts) {
      const relative = normalizeArtifactPath(artifact.path);
      const destination = path.join(staging, ...relative.split("/"));
      if (!isContained(staging, destination)) throw new Error(`Generated artifact escapes staging root: ${relative}`);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, artifact.content, { mode: artifact.executable ? 0o755 : 0o644 });
    }
    let backedUp = false;
    try { await rename(target, backup); backedUp = true; } catch (error) { if (error?.code !== "ENOENT") throw error; }
    try { await rename(staging, target); } catch (error) { if (backedUp) await rename(backup, target); throw error; }
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    await rm(backup, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function prefixArtifacts(prefix, artifacts) {
  return artifacts.map((artifact) => ({ ...artifact, path: path.posix.join(prefix, artifact.path) }));
}

async function requiredTree(root, relative, label) {
  const directory = path.join(root, relative);
  const artifacts = await readTree(directory);
  if (artifacts.length === 0) {
    throw new Error(`${label} is missing or empty at ${directory}. Build the Senior Engineering Workflow host projections before bundling @oovz/sew.`);
  }
  return artifacts;
}

function releaseManifest(source) {
  const manifest = structuredClone(source);
  delete manifest.private;
  delete manifest.scripts;
  manifest.description = "Install, update, diagnose, and configure Senior Engineering Workflow across supported coding-agent harnesses.";
  manifest.files = ["bin/", "lib/", "payloads/", "README.md", "LICENSE"];
  manifest.publishConfig = { ...(manifest.publishConfig ?? {}), access: "public" };
  return manifest;
}

export async function buildSewPackage(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const output = path.resolve(options.output ?? path.join(root, PACKAGE_OUTPUT));
  const sourceRoot = path.join(root, PACKAGE_SOURCE);
  const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  const pluginManifest = JSON.parse(await readFile(path.join(root, "plugins", PLUGIN_ID, "plugin.json"), "utf8"));

  if (sourceManifest.name !== "@oovz/sew") throw new Error(`Unexpected source package name: ${sourceManifest.name}`);
  if (sourceManifest.private !== true) throw new Error("packages/sew must remain private; only the staged CI package may be published.");
  if (pluginManifest.id !== PLUGIN_ID) throw new Error(`Unexpected plugin manifest id: ${pluginManifest.id}`);

  const artifacts = [];
  artifacts.push(...prefixArtifacts("bin", await requiredTree(sourceRoot, "bin", "SEW CLI bin source")));
  artifacts.push(...prefixArtifacts("lib", await requiredTree(sourceRoot, "lib", "SEW CLI library source")));
  artifacts.push({ path: "README.md", content: await readFile(path.join(sourceRoot, "README.md")) });
  artifacts.push({ path: "LICENSE", content: await readFile(path.join(sourceRoot, "LICENSE")) });
  artifacts.push({ path: "package.json", content: Buffer.from(json(releaseManifest(sourceManifest))) });

  for (const [host, relative] of Object.entries(STATIC_PAYLOADS)) {
    artifacts.push(...prefixArtifacts(path.posix.join("payloads", host), await requiredTree(root, relative, `${host} release payload`)));
  }

  artifacts.push({
    path: "payloads/manifest.json",
    content: Buffer.from(json({
      schemaVersion: 2,
      package: sourceManifest.name,
      packageVersion: sourceManifest.version,
      plugin: pluginManifest.id,
      pluginVersion: pluginManifest.version,
      repository: sourceManifest.repository?.url,
      hosts: ALL_HOSTS,
      staticHosts: Object.keys(STATIC_PAYLOADS),
    })),
  });

  await atomicWriteTree(output, artifacts, path.join(root, "release-build"));
  options.stdout?.write?.(`bundled ${path.relative(root, output)} from freshly built host projections\n`);
  return { root, output, packageVersion: sourceManifest.version, pluginVersion: pluginManifest.version, artifacts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSewPackage({ stdout: process.stdout }).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
