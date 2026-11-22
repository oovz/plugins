import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createFixtureMarketplace, execFileAsync, readJson, writeJson } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/prepare-plugin-release.mjs", import.meta.url));
const PLUGIN = "tauri-v2-desktop";
const TAG_PREFIX = "tauri-v";
const REPOSITORY = "oovz/plugins";

function published(tag, overrides = {}) {
  return { tag_name: tag, published_at: "2026-10-01T00:00:00Z", ...overrides };
}

async function fixture(t, plugin = PLUGIN) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "oovz-plugin-release-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "repository");
  await createFixtureMarketplace(root, [
    { id: plugin, version: "1.0.0" },
    { id: "other-plugin", version: "2.0.0" },
  ]);
  const git = async (...args) => {
    const { stdout } = await execFileAsync("git", [
      "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false",
      "-c", "user.name=Plugin Release Test", "-c", "user.email=release-test@example.invalid",
      ...args,
    ], { cwd: root });
    return stdout.trim();
  };
  await git("init", "--initial-branch=main");
  async function commit(subject) {
    await git("add", "--all");
    await git("commit", "-m", subject);
    return git("rev-parse", "HEAD");
  }
  async function version(value) {
    const file = path.join(root, "plugins", plugin, "manifest.json");
    await writeJson(file, { ...await readJson(file), version: value });
  }
  const releasesFile = path.join(sandbox, "releases.json");
  const output = path.join(sandbox, "metadata");
  async function prepare(tag, source, releases = []) {
    await writeJson(releasesFile, releases);
    return execFileAsync(process.execPath, [SCRIPT, tag, REPOSITORY, releasesFile, output], {
      cwd: root, env: { ...process.env, PLUGIN_SOURCE_COMMIT: source },
    });
  }
  return { root, git, commit, version, prepare, output, initial: await commit("feat: add both plugins") };
}

test("stable plugin notes use the tagged version and list only commits affecting the plugin", async (t) => {
  const repo = await fixture(t);
  const baseline = `${TAG_PREFIX}1.0.0`;
  await repo.git("tag", baseline);
  await appendFile(path.join(repo.root, `skills/${PLUGIN}-skill/references/guide.md`), "\nImprove live debugging.\n");
  const skill = await repo.commit("docs: improve the bundled skill");
  await writeJson(path.join(repo.root, `adapters/codex/${PLUGIN}/.mcp.json`), {});
  const adapter = await repo.commit("fix: refresh the plugin adapter");
  await appendFile(path.join(repo.root, "plugins/other-plugin/LICENSE"), "\nOther plugin update.\n");
  const unrelated = await repo.commit("fix: update another plugin");
  await mkdir(path.join(repo.root, "tools/sew"), { recursive: true });
  await writeFile(path.join(repo.root, "tools/sew/README.md"), "# CLI guide\n");
  const cli = await repo.commit("docs(sew): update the CLI guide");
  await repo.version("1.2.0");
  const target = await repo.commit("chore: bump the plugin version");
  const tag = `${TAG_PREFIX}1.2.0`;
  await repo.git("tag", "-a", tag, "-m", "Plugin release");
  await repo.version("2.0.0");

  await repo.prepare(tag, target, [
    [published("sew-cli-v1.1.0"), published("ced-v1.1.0"), published(baseline)],
    [published(`${TAG_PREFIX}1.2.0-rc.1`, { prerelease: true }), published(`${TAG_PREFIX}1.1.0`, { draft: true })],
  ]);
  const plan = await readJson(path.join(repo.output, "plan.json"));
  assert.deepEqual(plan, {
    tag, pluginId: PLUGIN, version: "1.2.0", previousTag: baseline, sourceCommit: target,
    title: `${PLUGIN} 1.2.0`, prerelease: false,
  });
  const notes = await readFile(path.join(repo.output, "notes.md"), "utf8");
  for (const included of [skill, adapter, target]) assert.ok(notes.includes(`/commit/${included}`), included);
  for (const excluded of [repo.initial, unrelated, cli]) assert.ok(!notes.includes(`/commit/${excluded}`), excluded);
});

test("the first SEW plugin prerelease skips both CLI tag formats", async (t) => {
  const repo = await fixture(t, "senior-engineering-workflow");
  await repo.git("tag", "sew-v1.0.0");
  await repo.version("1.1.0-rc.1");
  const source = await repo.commit("chore: prepare a prerelease");
  const tag = "sew-v1.1.0-rc.1";
  await repo.git("tag", tag);
  await repo.prepare(tag, source, [
    published("ced-v1.0.0"),
    published("sew-cli-v1.0.1"),
    published("sew-v1.0.0", { assets: [{ name: "oovz-sew-1.0.0.tgz" }] }),
  ]);
  const plan = await readJson(path.join(repo.output, "plan.json"));
  assert.equal(plan.pluginId, "senior-engineering-workflow");
  assert.equal(plan.prerelease, true);
  assert.equal(plan.previousTag, null);
  const notes = await readFile(path.join(repo.output, "notes.md"), "utf8");
  assert.ok(notes.includes(`/commit/${repo.initial}`));
});

test("the first Browser Extension Debugger release uses its own tag history", async (t) => {
  const repo = await fixture(t, "browser-extension-debugger");
  await repo.git("tag", "ced-v0.0.9");
  await repo.version("0.1.0");
  const source = await repo.commit("feat: introduce Browser Extension Debugger");
  const tag = "bed-v0.1.0";
  await repo.git("tag", tag);
  await repo.prepare(tag, source, [published("ced-v0.0.9")]);
  const plan = await readJson(path.join(repo.output, "plan.json"));
  assert.equal(plan.pluginId, "browser-extension-debugger");
  assert.equal(plan.sourceCommit, source);
  assert.equal(plan.previousTag, null);
});

test("plugin release preparation rejects invalid tags, uncataloged plugins, and mismatched source identities", async (t) => {
  const repo = await fixture(t);
  const source = repo.initial;
  const wrongVersion = `${TAG_PREFIX}2.0.0`;
  await repo.git("tag", wrongVersion);
  await repo.git("tag", "sew-v1.0.0");
  await assert.rejects(repo.prepare("sew-cli-v1.0.0", source), /Invalid plugin release tag/u);
  await assert.rejects(repo.prepare(`${PLUGIN}-v1.0.0`, source), /Invalid plugin release tag/u);
  await assert.rejects(repo.prepare(`${TAG_PREFIX}01.0.0`, source), /Invalid plugin release tag/u);
  await assert.rejects(repo.prepare("sew-v1.0.0", source), /not cataloged/u);
  await assert.rejects(repo.prepare(wrongVersion, source), /does not match its plugin manifest version/u);
  await assert.rejects(repo.prepare(wrongVersion, "0".repeat(40)), /not expected source/u);
});
