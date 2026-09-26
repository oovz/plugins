import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOST_LABELS = ["Claude Code", "Codex", "OpenCode", "Cursor", "Gemini CLI", "Antigravity CLI", "Oh My Pi"];

test("published support documentation lists each surface, scope, host version and runtime evidence", async () => {
  const rootReadme = await readFile(path.join(ROOT, "README.md"), "utf8");
  const cliReadme = await readFile(path.join(ROOT, "tools", "sew", "README.md"), "utf8");
  const pluginReadme = await readFile(path.join(ROOT, "plugins", "senior-engineering-workflow", "README.md"), "utf8");
  for (const host of HOST_LABELS) {
    assert.ok(rootReadme.includes(`| ${host}`), `${host} is in the root support matrix`);
    assert.ok(cliReadme.includes(`| ${host}`), `${host} is in the CLI support matrix`);
  }
  assert.match(cliReadme, /User role files[\s\S]*Project role files[\s\S]*Minimum host version[\s\S]*Last harness-native test/u);
  assert.match(cliReadme, /GEMINI_CLI_HOME[\s\S]*\.gemini\/agents/u);
  assert.match(cliReadme, /CLAUDE_CONFIG_DIR[\s\S]*\.claude\/agents/u);
  assert.match(cliReadme, /Antigravity.*\.gemini\/config\/agents/u);
  assert.match(cliReadme, /Windows, macOS and Linux/u);
  assert.match(cliReadme, /does not invoke a harness CLI/u);
  assert.match(cliReadme, /does not publish plugin manifests, skills, MCP declarations, marketplace records or host caches/u);
  assert.match(rootReadme, /Windsurf\/Cascade[\s\S]*portable Agent Skills/u);
  assert.match(rootReadme, /Devin CLI\/Desktop Local[\s\S]*not a generated target/u);
  assert.match(rootReadme, /gemini extensions install \.\/dist\/gemini-cli\/senior-engineering-workflow/u);
  assert.match(pluginReadme, /gemini extensions install \.\/dist\/gemini-cli\/senior-engineering-workflow/u);
  assert.match(rootReadme, /preserves valid model\/reasoning-only overrides/u);
  assert.match(cliReadme, /Antigravity model values are the documented tiers `inherit`, `flash`, and `pro`/u);
  assert.match(cliReadme, /Missing files are reported as `incomplete` with exit status 0/u);
});

test("migration and release setup docs name the exact external acceptance prerequisites", async () => {
  const rootReadme = await readFile(path.join(ROOT, "README.md"), "utf8");
  const cliReadme = await readFile(path.join(ROOT, "tools", "sew", "README.md"), "utf8");
  assert.match(rootReadme, /migrate-antigravity-ownership\.mjs --record/u);
  assert.match(rootReadme, /migrate-antigravity-ownership\.mjs --record[\s\S]*--apply/u);
  assert.match(rootReadme, /do not infer a project record from a guessed hash/u);
  assert.match(cliReadme, /npm 11\.5\.1/u);
  assert.match(cliReadme, /owner\/user `oovz`, repository `plugins`, and workflow filename `release-sew\.yml`/u);
  assert.match(cliReadme, /account association and hosted job results must be checked before publishing/u);
});

test("release smoke is configured for the exact artifact on every native OS and supported Node major", async () => {
  const workflow = await readFile(path.join(ROOT, ".github", "workflows", "release-sew.yml"), "utf8");
  assert.match(workflow, /Upload the immutable candidate tarball/u);
  assert.match(workflow, /smoke:[\s\S]*needs: build/u);
  assert.match(workflow, /os:\s*\[ubuntu-latest, macos-latest, windows-latest\]/u);
  assert.match(workflow, /node:\s*\[22, 24\]/u);
  assert.match(workflow, /actions\/download-artifact/u);
  assert.match(workflow, /scripts\/smoke-sew-release\.mjs/u);
  assert.match(workflow, /release:[\s\S]*needs: smoke/u);
  assert.match(await readFile(path.join(ROOT, "scripts", "smoke-sew-release.mjs"), "utf8"), /node_modules.*\.bin/u);
});

test("the released CLI no longer depends on marketplace or process-coordination dependencies", async () => {
  const cli = JSON.parse(await readFile(path.join(ROOT, "tools", "sew", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(cli.dependencies).sort(), ["smol-toml", "yaml"]);
  for (const removed of ["codex-config.mjs", "managed-files.mjs", "process.mjs", "harness-catalog.mjs", "host-paths.mjs"]) {
    assert.equal(await exists(path.join(ROOT, "tools", "sew", "lib", removed)), false, `${removed} is obsolete under configuration-only SEW`);
  }
});

async function exists(file) {
  try { await (await import("node:fs/promises")).access(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

test("supported Node engine requirements match the repository validation matrix", async () => {
  const rootPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const sewPackage = JSON.parse(await readFile(path.join(ROOT, "tools", "sew", "package.json"), "utf8"));
  const workflow = await readFile(path.join(ROOT, ".github", "workflows", "validate-reusable.yml"), "utf8");
  assert.equal(rootPackage.engines.node, ">=22");
  assert.equal(sewPackage.engines.node, ">=22");
  assert.match(workflow, /node:\s*\[22, 24\]/u);
});
