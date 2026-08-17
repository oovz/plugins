import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { discoverMarketplace, inspectPlugin } from "../scripts/lib/marketplace.mjs";
import { renderHost } from "../scripts/lib/hosts.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT_SEW_ROOT = path.join(ROOT, "release-build", "sew", "package");
const { internals, main } = await import(`${pathToFileURL(path.join(BUILT_SEW_ROOT, "lib", "sew.mjs")).href}?cursor=${Date.now()}`);

async function temp(prefix) { return mkdtemp(path.join(os.tmpdir(), prefix)); }
async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
function cursorSpawnSync(bin, args) {
  if (args.join(" ") === "models") {
    return { status: 0, stdout: "claude-3.7-sonnet\ncomposer-1.5\ngpt-4o\n", stderr: "" };
  }
  return { status: 0, stdout: "", stderr: "" };
}

async function capture(argv, env, spawnSync = cursorSpawnSync) {
  let stdout = "";
  let stderr = "";
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk) => { stdout += String(chunk); return true; });
  process.stderr.write = ((chunk) => { stderr += String(chunk); return true; });
  try { return { code: await main(argv, { env, spawnSync }), stdout, stderr }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

test("Cursor renderer emits a native plugin with model-neutral subagents and no added restrictions", async () => {
  const catalog = await discoverMarketplace(ROOT);
  const source = catalog.plugins.find((plugin) => plugin.manifest.id === "senior-engineering-workflow");
  assert.ok(source, "Senior Engineering Workflow must be present in the marketplace catalog");
  const plugin = await inspectPlugin(source);
  const rendered = renderHost(plugin, "cursor");
  const artifacts = new Map(rendered.artifacts.map((artifact) => [artifact.path, artifact.content.toString("utf8")]));
  const manifest = JSON.parse(artifacts.get(".cursor-plugin/plugin.json"));
  assert.equal(manifest.name, "senior-engineering-workflow");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.agents, "./agents/");
  assert.equal(manifest.minClientVersions.cursor, "2.5.0");
  assert.deepEqual(Object.keys(manifest).sort(), [
    "agents", "author", "category", "description", "displayName", "homepage", "keywords", "license", "minClientVersions", "name", "repository", "skills", "version"
  ]);
  for (const role of ["researcher", "engineer", "verifier", "worker"]) {
    const content = artifacts.get(`agents/senior-engineering-workflow-${role}.md`);
    assert.match(content, new RegExp(`name: senior-engineering-workflow-${role}`));
    assert.doesNotMatch(content, /^model:/mu);
    assert.doesNotMatch(content, /^readonly:/mu);
    assert.doesNotMatch(content, /^tools:/mu);
  }
});

test("@oovz/sew installs and configures Cursor user and project agents", async () => {
  const project = await temp("sew-cursor-");
  const home = path.join(project, "home");
  const env = { HOME: home, XDG_STATE_HOME: path.join(project, "state") };
  assert.equal(internals.userConfigRoot("cursor", { env, platform: "linux", home }), path.join(home, ".cursor"));
  assert.equal(internals.projectConfigRoot("cursor", project), path.join(project, ".cursor"));

  const install = await capture(["install", "--host", "cursor", "--scope", "project", "--project", project, "--json"], env);
  assert.equal(install.code, 0, install.stderr);
  const worker = path.join(project, ".cursor", "agents", "senior-engineering-workflow-worker.md");
  const skill = path.join(project, ".cursor", "skills", "senior-engineering-workflow", "SKILL.md");
  assert.equal(await exists(worker), true);
  assert.equal(await exists(skill), true);
  assert.doesNotMatch(await readFile(worker, "utf8"), /^model:/mu);

  const modelConfig = await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "composer-1.5"
  ], env);
  assert.equal(modelConfig.code, 0, modelConfig.stderr);
  assert.match(await readFile(worker, "utf8"), /^model:\s*"composer-1\.5"/mu);
  assert.doesNotMatch(await readFile(worker, "utf8"), /^thinking:/mu);

  const invalidThinking = await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "composer-1.5", "--worker-thinking", "high"
  ], env);
  assert.equal(invalidThinking.code, 2);
  assert.match(invalidThinking.stderr, /Cursor agent files do not expose a supported thinking-level field/u);

  const unsupportedConfig = await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "unsupported-cursor-model"
  ], env);
  assert.equal(unsupportedConfig.code, 2);
  assert.match(unsupportedConfig.stderr, /not available in the local Cursor catalog/u);

  const restore = await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "inherit"
  ], env);
  assert.equal(restore.code, 0, restore.stderr);
  assert.doesNotMatch(await readFile(worker, "utf8"), /^model:/mu);
});

test("Cursor inheritance reset can remove a stale unsupported thinking field from prior state", async () => {
  const project = await temp("sew-cursor-stale-thinking-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  assert.equal((await capture(["install", "--host", "cursor", "--scope", "project", "--project", project], env)).code, 0);
  assert.equal((await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "composer-1.5",
  ], env)).code, 0);

  const statePath = path.join(project, ".oovz", "sew", "cursor.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.models.worker.thinking = "high";
  await writeFile(statePath, JSON.stringify(state));

  const restore = await capture([
    "models", "configure", "--host", "cursor", "--scope", "project", "--project", project,
    "--preset", "inherit",
  ], env);
  assert.equal(restore.code, 0, restore.stderr);
  const worker = path.join(project, ".cursor", "agents", "senior-engineering-workflow-worker.md");
  assert.doesNotMatch(await readFile(worker, "utf8"), /^model:/mu);
});

test("repository installer writes Cursor skill files without copying the native manifest", async () => {
  const { runInstaller } = await import("../scripts/install.mjs");
  const project = await temp("cursor-installer-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  await runInstaller([
    "install", "--plugin", "tauri-v2-desktop", "--host", "cursor", "--scope", "project", "--project", project
  ], { root: ROOT, env, cwd: project, stdout: { write() {} } });
  assert.equal(await exists(path.join(project, ".cursor", "skills", "tauri-v2-desktop", "SKILL.md")), true);
  assert.equal(await exists(path.join(project, ".cursor", ".cursor-plugin", "plugin.json")), false);
});

test("migration documentation provides manual schema-1 cleanup paths", async () => {
  const readme = await readFile(path.join(ROOT, "packages", "sew", "README.md"), "utf8");
  assert.match(readme, /Migrate a 0.9.x static installation to 0.10.0 or later/u);
  assert.match(readme, /%LOCALAPPDATA%\\oovz\\sew/u);
  assert.match(readme, /\.oovz\/sew\/<host>\.json/u);
  assert.match(readme, /Do not delete the Codex marketplace-owned skill/u);
});
