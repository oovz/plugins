import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverMarketplace, inspectPlugin } from "../scripts/lib/marketplace.mjs";
import { renderHost } from "../scripts/lib/hosts.mjs";
import { runInstaller } from "../scripts/install.mjs";
import { createFixtureMarketplace } from "./helpers.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

test("Cursor plugin adapter remains a separate marketplace product", async () => {
  const catalog = await discoverMarketplace(ROOT);
  const source = catalog.plugins.find((plugin) => plugin.manifest.id === "senior-engineering-workflow");
  assert.ok(source);
  const plugin = await inspectPlugin(source);
  const rendered = renderHost(plugin, "cursor");
  const artifacts = new Map(rendered.artifacts.map((artifact) => [artifact.path, artifact.content.toString("utf8")]));
  const manifest = JSON.parse(artifacts.get(".cursor-plugin/plugin.json"));
  assert.equal(manifest.name, "senior-engineering-workflow");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.agents, "./agents/");
  assert.equal(manifest.minClientVersions.cursor, "2.5.0");
  for (const role of ["researcher", "engineer", "verifier"]) {
    const definition = artifacts.get(`agents/senior-engineering-workflow-${role}.md`);
    assert.match(definition, new RegExp(`name: senior-engineering-workflow-${role}`));
    assert.doesNotMatch(definition, /^model:/mu);
    assert.doesNotMatch(definition, /^readonly:/mu);
    assert.doesNotMatch(definition, /^tools:/mu);
  }
});

test("generic marketplace installer still writes a Cursor plugin skill independently", async (t) => {
  const project = await mkdtemp(path.join(os.tmpdir(), "cursor-marketplace-installer-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await runInstaller([
    "install", "--plugin", "tauri-v2-desktop", "--host", "cursor", "--scope", "project", "--project", project,
  ], { root: ROOT, env: { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") }, cwd: project, stdout: { write() {} } });
  assert.equal(await exists(path.join(project, ".cursor", "skills", "tauri-v2-desktop", "SKILL.md")), true);
  assert.equal(await exists(path.join(project, ".cursor", ".cursor-plugin", "plugin.json")), false);
});

test("Cursor direct install rejects command-bearing plugins before writing files or ownership state", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cursor-command-installer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "cursor-fixture", version: "1.0.0", options: {
      includeAgent: false,
      hosts: { cursor: { enabled: true } },
      command: { id: "check", path: "commands/check.md", hosts: ["cursor"] },
    },
  }]);
  const project = path.join(root, "project");
  const state = path.join(root, "state");
  for (const operation of ["install", "update"]) {
    await assert.rejects(runInstaller([
      operation, "--plugin", "cursor-fixture", "--host", "cursor", "--scope", "project", "--project", project,
    ], { root, env: { HOME: root, XDG_STATE_HOME: state }, cwd: root, stdout: { write() {} } }), (error) => {
      assert.match(error.message, /Cursor.*commands/i);
      assert.match(error.message, /native.*plugin.*marketplace/i);
      return true;
    });
    assert.equal(await exists(project), false);
    assert.equal(await exists(state), false);
  }
});
