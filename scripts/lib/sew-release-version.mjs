import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const SEW_SOURCE_PACKAGE = path.join(REPO_ROOT, "packages", "sew", "package.json");
export const SEW_PLUGIN_MANIFEST = path.join(REPO_ROOT, "plugins", "senior-engineering-workflow", "plugin.json");
export const SEW_STAGE_ROOT = path.join(REPO_ROOT, "release-build", "sew", "package");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listJsonFiles(root) {
  if (!(await exists(root))) return [];
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolute);
    }
  }
  await walk(root);
  return files.sort();
}

export async function readSewSourceVersions() {
  const [packageManifest, pluginManifest] = await Promise.all([
    readJson(SEW_SOURCE_PACKAGE),
    readJson(SEW_PLUGIN_MANIFEST),
  ]);
  return {
    packageManifest,
    pluginManifest,
    packageVersion: packageManifest.version,
    pluginVersion: pluginManifest.version,
  };
}

export async function assertSewSourceVersionAlignment() {
  const versions = await readSewSourceVersions();
  if (versions.packageVersion !== versions.pluginVersion) {
    throw new Error(
      `SEW version mismatch: @oovz/sew is ${versions.packageVersion}, ` +
      `but senior-engineering-workflow is ${versions.pluginVersion}`,
    );
  }
  return versions;
}

export async function assertSewReleaseVersionAlignment({ requireStaged = false } = {}) {
  const versions = await assertSewSourceVersionAlignment();
  const stagedManifestPath = path.join(SEW_STAGE_ROOT, "package.json");
  const stagedExists = await exists(stagedManifestPath);
  if (!stagedExists) {
    if (requireStaged) throw new Error(`missing staged SEW package: ${stagedManifestPath}`);
    return versions;
  }

  const stagedManifest = await readJson(stagedManifestPath);
  if (stagedManifest.version !== versions.packageVersion) {
    throw new Error(
      `staged @oovz/sew version ${stagedManifest.version ?? "<missing>"} ` +
      `does not match source version ${versions.packageVersion}`,
    );
  }
  if (stagedManifest.sewPluginVersion !== versions.pluginVersion) {
    throw new Error(
      `staged package sewPluginVersion ${stagedManifest.sewPluginVersion ?? "<missing>"} ` +
      `does not match plugin version ${versions.pluginVersion}`,
    );
  }
  if (stagedManifest.publishConfig?.provenance !== true) {
    throw new Error("staged @oovz/sew package must set publishConfig.provenance to true");
  }

  const payloadRoot = path.join(SEW_STAGE_ROOT, "payloads");
  const jsonFiles = await listJsonFiles(payloadRoot);
  let pluginVersionManifestCount = 0;
  for (const filePath of jsonFiles) {
    const value = await readJson(filePath);
    if (!Object.hasOwn(value, "pluginVersion")) continue;
    pluginVersionManifestCount += 1;
    if (value.pluginVersion !== versions.pluginVersion) {
      throw new Error(
        `${path.relative(REPO_ROOT, filePath)} declares pluginVersion ${value.pluginVersion}, ` +
        `expected ${versions.pluginVersion}`,
      );
    }
  }
  if (pluginVersionManifestCount === 0) {
    throw new Error("staged SEW payloads do not contain a pluginVersion manifest");
  }

  return { ...versions, stagedManifest, pluginVersionManifestCount };
}
